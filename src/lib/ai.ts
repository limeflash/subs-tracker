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
  action?: "add" | "update" | "mark_paid";
  matchTitle?: string | null; // title of the existing subscription this refers to
  group?: string | null; // group name (existing or suggested)
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

export interface AiContext {
  subscriptions: { title: string; amount: number; currency: string; cycle: string; nextPaymentDate: string; groups: string[] }[];
  groups: string[];
}

/** Current subscriptions + groups, fed to the model so it can match/update/close. */
export async function buildAiContext(): Promise<AiContext> {
  const [subs, groups] = await Promise.all([
    prisma.subscription.findMany({
      where: { active: true },
      include: { currency: true, groups: { include: { group: true } } },
      orderBy: { title: "asc" },
      take: 100,
    }),
    prisma.group.findMany({ orderBy: { name: "asc" } }),
  ]);
  return {
    subscriptions: subs.map((s) => ({
      title: s.title,
      amount: Number(s.amount),
      currency: s.currency.code,
      cycle: s.billingCycle,
      nextPaymentDate: s.nextPaymentDate.toISOString().slice(0, 10),
      groups: s.groups.map((g) => g.group.name),
    })),
    groups: groups.map((g) => g.name),
  };
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

const PROMPT = `Ты — ассистент учёта подписок. Тебе дают скриншот или текст (страница оплаты, инвойс, чек, письмо) и список текущих подписок пользователя.

Для каждой позиции определи ДЕЙСТВИЕ и верни СТРОГО JSON-массив:
[{
  "action": "add" | "update" | "mark_paid",
  "matchTitle": "точное название существующей подписки из списка (для update/mark_paid), иначе null",
  "title": "название сервиса",
  "amount": 9.99,
  "currency": "ISO-код валюты: USD, EUR, RUB, TRY, GBP...",
  "cycle": "MONTHLY | QUARTERLY | YEARLY | CUSTOM",
  "every": 1,
  "unitDays": null,
  "url": "официальный сайт сервиса (впиши, если знаешь), иначе null",
  "nextPaymentDate": "YYYY-MM-DD или null",
  "notes": "короткая заметка или null",
  "group": "подходящая группа из списка пользователя или новое короткое название, иначе null"
}]

Правила выбора действия:
- "mark_paid" — на скриншоте оплата/инвойс/чек/письмо об успешном платеже (Paid, receipt, invoice paid) по подписке, которая УЖЕ есть в списке пользователя.
- "update" — подписка уже есть в списке, но изменились цена, период или дата следующего платежа.
- "add" — такой подписки в списке нет.

Остальные правила:
- "каждый месяц/ежемесячно/monthly" → MONTHLY, every=1; "раз в год/yearly/annually" → YEARLY; "каждые 3 месяца" → QUARTERLY или MONTHLY с every=3; "раз в N дней" → CUSTOM с unitDays=N.
- Пояснение пользователя (подпись/текст) — важный контекст: оно уточняет, какая подписка нужна и как её назвать; сохрани его в "notes".
- Дата следующего платежа: дата renewal/следующего списания/due date. Если не видна — null.
- Если на скриншоте несколько позиций, но пользователь в пояснении указал одну — верни только её. Если позиций несколько и все нужны — верни все (например, строки инвойса могут быть одной подпиской с общей суммой Total).
- "group": выбирай по смыслу (хостинг/VPS → инфраструктура/хостинг; музыка/видео → развлечения и т.п.) из существующих групп пользователя, либо предложи новую.
- Только JSON, без пояснений. Если подписок нет — верни [].`;

function contextBlock(ctx?: AiContext): string {
  if (!ctx) return "";
  const subs = ctx.subscriptions.length
    ? ctx.subscriptions
        .map((s) => `- ${s.title}: ${s.amount} ${s.currency}, ${s.cycle}, след. ${s.nextPaymentDate}${s.groups.length ? ` [${s.groups.join(", ")}]` : ""}`)
        .join("\n")
    : "(пусто)";
  const groups = ctx.groups.length ? ctx.groups.join(", ") : "(нет групп)";
  return `\n\nТекущие подписки пользователя:\n${subs}\n\nГруппы пользователя: ${groups}`;
}

async function chatOnce(cfg: AiConfig, content: string, images: string[] | undefined, timeoutMs: number): Promise<string> {
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
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return String(json?.message?.content ?? "");
}

async function chat(cfg: AiConfig, content: string, images?: string[]): Promise<string> {
  // Ollama Cloud can be very slow under load (tens of seconds even for tiny
  // prompts); vision + long context takes minutes. Generous timeout + 1 retry.
  const timeoutMs = 300_000;
  try {
    return await chatOnce(cfg, content, images, timeoutMs);
  } catch (e) {
    console.warn("[ai] first attempt failed, retrying:", (e as Error).message);
    return await chatOnce(cfg, content, images, timeoutMs);
  }
}

function sanitize(raw: unknown[]): ParsedSub[] {
  const out: ParsedSub[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? "").trim().slice(0, 200);
    const amount = Number(o.amount);
    if (!title || !isFinite(amount) || amount < 0) continue;
    const cycleRaw = String(o.cycle ?? "MONTHLY").toUpperCase();
    const cycle = (["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] as const).includes(cycleRaw as never)
      ? (cycleRaw as ParsedSub["cycle"])
      : "MONTHLY";
    const every = Math.max(1, Math.min(365, parseInt(String(o.every ?? 1), 10) || 1));
    const currency = String(o.currency ?? "USD").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || "USD";
    const actionRaw = String(o.action ?? "add").toLowerCase();
    out.push({
      action: (["add", "update", "mark_paid"] as const).includes(actionRaw as never)
        ? (actionRaw as ParsedSub["action"])
        : "add",
      matchTitle: o.matchTitle ? String(o.matchTitle).slice(0, 200) : null,
      group: o.group ? String(o.group).trim().slice(0, 100) || null : null,
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

export async function parseSubscriptionsFromImage(
  imageBase64: string,
  caption?: string,
  ctx?: AiContext,
): Promise<ParsedSub[]> {
  const cfg = await getAiConfig();
  if (!cfg) throw new Error("AI не настроен — добавьте ключ Ollama Cloud в Настройках");
  const content = await chat(
    cfg,
    (caption?.trim()
      ? `Разбери скриншот. Пояснение пользователя: «${caption.trim().slice(0, 500)}»`
      : "Разбери скриншот.") + contextBlock(ctx),
    [imageBase64],
  );
  return sanitize(extractJsonArray(content));
}

export async function parseSubscriptionsFromText(text: string, ctx?: AiContext): Promise<ParsedSub[]> {
  const cfg = await getAiConfig();
  if (!cfg) throw new Error("AI не настроен");
  const today = new Date().toISOString().slice(0, 10);
  const content = await chat(cfg, `Сегодня ${today}. Текст пользователя: «${text.slice(0, 1000)}»${contextBlock(ctx)}`);
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
