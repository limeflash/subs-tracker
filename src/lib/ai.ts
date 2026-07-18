import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * Ollama Cloud client (vision) — parses subscription data from screenshots
 * and free text. API key is stored encrypted in the DB; OLLAMA_API_KEY env
 * var acts as a fallback.
 */

export interface AiConfig {
  apiKey: string;
  model: string;
}

export interface ParsedSub {
  title: string;
  amount: number;
  currency: string; // ISO code, e.g. USD
  cycle: "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
  every: number;
  unitDays?: number | null;
  url?: string | null;
  nextPaymentDate?: string | null; // YYYY-MM-DD
  notes?: string | null;
}

const HOST = "https://ollama.com";
const DEFAULT_MODEL = "qwen3.5:122b";

export async function getAiConfig(): Promise<AiConfig | null> {
  const user = await prisma.user.findFirst({
    where: { aiApiKeyCipher: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  if (user?.aiApiKeyCipher) {
    try {
      return { apiKey: decrypt(user.aiApiKeyCipher), model: user.aiModel || DEFAULT_MODEL };
    } catch {
      return null;
    }
  }
  const envKey = process.env.OLLAMA_API_KEY;
  if (envKey) {
    const anyUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    return { apiKey: envKey, model: anyUser?.aiModel || DEFAULT_MODEL };
  }
  return null;
}

const PROMPT = `Ты — парсер подписок. Из входных данных (скриншот страницы оплаты/подписки или текст) извлеки информацию о подписках.

Верни СТРОГО JSON-массив объектов:
[{
  "title": "название сервиса",
  "amount": 9.99,
  "currency": "ISO-код валюты: USD, EUR, RUB, TRY, GBP...",
  "cycle": "MONTHLY | QUARTERLY | YEARLY | CUSTOM",
  "every": 1,
  "unitDays": null,
  "url": "сайт сервиса или null",
  "nextPaymentDate": "YYYY-MM-DD или null",
  "notes": "короткая заметка или null"
}]

Правила:
- "каждый месяц/ежемесячно/monthly" → MONTHLY, every=1; "раз в год/yearly/annually" → YEARLY; "каждые 3 месяца" → QUARTERLY или MONTHLY с every=3; "раз в N дней" → CUSTOM с unitDays=N.
- Если дата следующего платежа не видна — null.
- Если на скриншоте несколько подписок/тарифов — верни все.
- Только JSON, без пояснений. Если подписок нет — верни [].`;

async function chat(cfg: AiConfig, content: string, images?: string[]): Promise<string> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content, ...(images?.length ? { images } : {}) },
      ],
      options: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return String(json?.message?.content ?? "");
}

function sanitize(raw: unknown[]): ParsedSub[] {
  const out: ParsedSub[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? "").trim().slice(0, 200);
    const amount = Number(o.amount);
    if (!title || !isFinite(amount) || amount <= 0) continue;
    const cycleRaw = String(o.cycle ?? "MONTHLY").toUpperCase();
    const cycle = (["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] as const).includes(cycleRaw as never)
      ? (cycleRaw as ParsedSub["cycle"])
      : "MONTHLY";
    const every = Math.max(1, Math.min(365, parseInt(String(o.every ?? 1), 10) || 1));
    const currency = String(o.currency ?? "USD").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || "USD";
    out.push({
      title,
      amount: Math.round(amount * 100) / 100,
      currency,
      cycle,
      every,
      unitDays: o.unitDays ? Math.max(1, parseInt(String(o.unitDays), 10) || 30) : null,
      url: o.url ? String(o.url).slice(0, 300) : null,
      nextPaymentDate:
        typeof o.nextPaymentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.nextPaymentDate)
          ? o.nextPaymentDate
          : null,
      notes: o.notes ? String(o.notes).slice(0, 500) : null,
    });
  }
  return out;
}

function extractJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      // model wrapped it: {"subscriptions": [...]} or a single object
      const arr = Object.values(parsed).find((v) => Array.isArray(v));
      if (arr) return arr as unknown[];
      return [parsed];
    }
  } catch {
    const m = trimmed.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* fall through */
      }
    }
  }
  return [];
}

export async function parseSubscriptionsFromImage(imageBase64: string): Promise<ParsedSub[]> {
  const cfg = await getAiConfig();
  if (!cfg) throw new Error("AI не настроен — добавьте ключ Ollama Cloud в Настройках");
  const content = await chat(cfg, "Извлеки подписки со скриншота.", [imageBase64]);
  return sanitize(extractJsonArray(content));
}

export async function parseSubscriptionsFromText(text: string): Promise<ParsedSub[]> {
  const cfg = await getAiConfig();
  if (!cfg) throw new Error("AI не настроен");
  const today = new Date().toISOString().slice(0, 10);
  const content = await chat(cfg, `Сегодня ${today}. Текст пользователя: «${text.slice(0, 1000)}»`);
  return sanitize(extractJsonArray(content));
}

export async function testAiKey(apiKey: string, model: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        stream: false,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Ollama ${res.status}: ${body.slice(0, 150)}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Find a currency by ISO code; create it (symbol = code) if unknown. */
export async function resolveCurrencyId(code: string): Promise<string | null> {
  const norm = code.trim().toUpperCase();
  if (!norm) return null;
  const existing = await prisma.currency.findUnique({ where: { code: norm } });
  if (existing) return existing.id;
  try {
    const created = await prisma.currency.create({ data: { code: norm, symbol: norm } });
    return created.id;
  } catch {
    return null;
  }
}
