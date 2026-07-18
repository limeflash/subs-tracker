import { prisma } from "@/lib/db";
import {
  getTelegramConfig,
  getUpdates,
  answerCallback,
  editMessage,
  setMyCommands,
  tgCall,
  type TelegramConfig,
  type TgUpdate,
  type InlineButton,
} from "@/lib/telegram";
import { markSubscriptionPaid, createFromParsed } from "@/lib/subscriptions";
import { getAiConfig, parseSubscriptionsFromImage, parseSubscriptionsFromText, type ParsedSub } from "@/lib/ai";
import { convertAmount, monthlyEquivalent } from "@/lib/exchange";
import { monthRange } from "@/lib/stats";
import { formatMoney, formatDate } from "@/lib/utils";

/**
 * Two-way Telegram bot. Long-polls getUpdates inside the app process (started
 * from the scheduler) — no webhook / public endpoint needed. Only answers the
 * configured owner's chat_id; everything else is ignored.
 */

const DAY_MS = 86_400_000;

type Ctx = "u" | "d" | "o" | "p"; // upcoming | due-today | overdue | paid-cmd

interface PendingAi {
  items: ParsedSub[];
  added: Set<number>;
  at: number;
}
// AI import drafts awaiting the owner's "Добавить" tap. In-memory is fine:
// single-process app, worst case a restart means re-sending the screenshot.
const pendingAi = new Map<string, PendingAi>();

let pollingStarted = false;
let commandsRegistered = false;

export function startBotPolling(): void {
  if (pollingStarted) return;
  pollingStarted = true;
  void pollLoop();
}

async function pollLoop(): Promise<void> {
  let offset: number | null = null;
  for (;;) {
    const cfg = await getTelegramConfig().catch(() => null);
    if (!cfg) {
      await sleep(20_000); // not configured yet — check again later
      continue;
    }
    try {
      if (!commandsRegistered) {
        await setMyCommands(cfg);
        commandsRegistered = true;
      }
      if (offset === null) {
        // skip backlog accumulated while the app was down
        const last = await getUpdates(cfg, -1, 0);
        if (last === null) {
          await sleep(10_000);
          continue;
        }
        offset = last.length > 0 ? last[last.length - 1].update_id + 1 : 0;
        continue;
      }
      const updates = await getUpdates(cfg, offset, 30);
      if (updates === null) {
        // network error / 409 conflict (another consumer, e.g. dev machine)
        await sleep(15_000);
        continue;
      }
      for (const u of updates) {
        offset = u.update_id + 1;
        console.log("[bot] update:", u.message?.text ?? (u.message?.photo ? "<photo>" : u.callback_query?.data ?? "?"));
        await handleUpdate(u, cfg).catch((e) => console.error("[bot] handle error:", e));
      }
    } catch {
      await sleep(5_000);
    }
  }
}

async function handleUpdate(u: TgUpdate, cfg: TelegramConfig): Promise<void> {
  const msg = u.message;
  if (msg && msg.chat.id.toString() === cfg.chatId) {
    if (msg.photo && msg.photo.length > 0) return handlePhoto(cfg, msg.photo, msg.caption);
    if (msg.text) {
      const text = msg.text.trim();
      const cmd = text.split(/\s+/)[0].split("@")[0].toLowerCase();
      if (cmd === "/add") {
        const payload = text.slice(text.indexOf(" ") + 1);
        if (!payload || payload === text) return send(cfg, "Пример: <code>/add Netflix 999₽ в месяц</code>");
        return handleAiText(cfg, payload);
      }
      switch (cmd) {
        case "/start":
        case "/help":
          return sendHelp(cfg);
        case "/upcoming":
          return sendList(cfg, "u");
        case "/today":
          return sendList(cfg, "d");
        case "/overdue":
          return sendList(cfg, "o");
        case "/paid":
          return sendList(cfg, "p");
        case "/month":
          return sendMonth(cfg);
        default:
          return send(cfg, "Не знаю такую команду. /help — список команд.");
      }
    }
  }

  const cq = u.callback_query;
  if (cq?.data && cq.message && cq.message.chat.id.toString() === cfg.chatId) {
    const [kind, a, b, c] = cq.data.split(":");
    if (kind === "cmd") {
      await answerCallback(cfg, cq.id);
      if (a === "u" || a === "d" || a === "o" || a === "p") return sendList(cfg, a);
      if (a === "m") return sendMonth(cfg);
      return sendHelp(cfg);
    }
    if (kind === "ai") {
      return handleAiCallback(cfg, cq.id, cq.message.chat.id, cq.message.message_id, a, b, c);
    }
    if (kind === "paid" && a && b) {
      const ctx = a as Ctx;
      const id = b;
      const res = await markSubscriptionPaid(id);
      if (!res) {
        await answerCallback(cfg, cq.id, "Подписка не найдена");
        return;
      }
      await answerCallback(cfg, cq.id, `✅ ${res.title} — оплачено`);
      await sendTelegramDirect(
        cfg,
        `☑️ <b>${esc(res.title)}</b> оплачена — ${formatMoney(res.amount, res.currencyCode)}.\n` +
          `Следующее списание: ${formatDate(res.nextPaymentDate)}`,
      );
      // refresh the list the button came from
      const list = await buildList(ctx);
      await editMessage(cfg, cq.message.chat.id, cq.message.message_id, list.text, list.keyboard);
    }
  }
}

// ---------- AI import (screenshots + /add text) ----------

async function handlePhoto(
  cfg: TelegramConfig,
  photos: { file_id: string; file_size?: number }[],
  caption?: string,
): Promise<void> {
  if (!(await getAiConfig())) {
    return send(cfg, "🤖 AI-импорт не настроен. Добавьте ключ Ollama Cloud в Настройки → AI.");
  }
  await send(cfg, "🔍 Распознаю скриншот…");
  try {
    const largest = photos[photos.length - 1];
    const file = await tgCall<{ file_path?: string }>(cfg, "getFile", { file_id: largest.file_id });
    if (!file?.file_path) return send(cfg, "Не удалось скачать изображение.");
    const res = await fetch(`https://api.telegram.org/file/bot${cfg.botToken}/${file.file_path}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return send(cfg, "Не удалось скачать изображение.");
    const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    const items = await parseSubscriptionsFromImage(base64);
    return presentAiDrafts(cfg, items, caption);
  } catch (e) {
    return send(cfg, `Ошибка распознавания: ${esc((e as Error).message.slice(0, 200))}`);
  }
}

async function handleAiText(cfg: TelegramConfig, text: string): Promise<void> {
  if (!(await getAiConfig())) {
    return send(cfg, "🤖 AI-импорт не настроен. Добавьте ключ Ollama Cloud в Настройки → AI.");
  }
  try {
    const items = await parseSubscriptionsFromText(text);
    return presentAiDrafts(cfg, items, text);
  } catch (e) {
    return send(cfg, `Ошибка: ${esc((e as Error).message.slice(0, 200))}`);
  }
}

function newPending(items: ParsedSub[]): string {
  // sweep stale drafts (>30 min)
  for (const [k, v] of pendingAi) {
    if (Date.now() - v.at > 30 * 60_000) pendingAi.delete(k);
  }
  const id = Math.random().toString(36).slice(2, 10);
  pendingAi.set(id, { items, added: new Set(), at: Date.now() });
  return id;
}

function renderDrafts(pid: string, p: PendingAi): { text: string; keyboard: InlineButton[][] } {
  const lines = p.items.map((it, i) => {
    const done = p.added.has(i) ? " ✅" : "";
    return `• <b>${esc(it.title)}</b> — ${formatMoney(it.amount, it.currency)} · ${cycleLabel(it)}${done}`;
  });
  const keyboard: InlineButton[][] = [];
  p.items.forEach((it, i) => {
    if (!p.added.has(i)) keyboard.push([{ text: `➕ ${it.title}`, callback_data: `ai:a:${pid}:${i}` }]);
  });
  keyboard.push([{ text: "❌ Отмена", callback_data: `ai:s:${pid}:0` }]);
  return { text: lines.join("\n"), keyboard };
}

async function presentAiDrafts(cfg: TelegramConfig, items: ParsedSub[], source?: string): Promise<void> {
  if (items.length === 0) {
    return send(cfg, "Подписок не нашёл. Попробуйте скриншот почище или формат: <code>/add Netflix 999₽ в месяц</code>");
  }
  const id = newPending(items);
  const p = pendingAi.get(id)!;
  const r = renderDrafts(id, p);
  await send(
    cfg,
    `🤖 <b>Нашёл ${items.length === 1 ? "подписку" : `подписки (${items.length})`}:</b>\n\n${r.text}\n\nНажмите ➕, чтобы добавить.`,
    r.keyboard,
  );
}

async function handleAiCallback(
  cfg: TelegramConfig,
  cqId: string,
  chatId: number,
  messageId: number,
  action: string,
  pid: string,
  idxRaw: string,
): Promise<void> {
  const p = pendingAi.get(pid);
  if (!p) {
    await answerCallback(cfg, cqId, "Черновик устарел — отправьте скриншот ещё раз");
    return;
  }
  if (action === "s") {
    pendingAi.delete(pid);
    await answerCallback(cfg, cqId, "Отменено");
    await editMessage(cfg, chatId, messageId, "Импорт отменён.");
    return;
  }
  const idx = parseInt(idxRaw, 10);
  const item = p.items[idx];
  if (!item || p.added.has(idx)) {
    await answerCallback(cfg, cqId, "Уже добавлено");
    return;
  }
  const res = await createFromParsed(item);
  if ("error" in res) {
    await answerCallback(cfg, cqId, res.error);
    return;
  }
  p.added.add(idx);
  await answerCallback(cfg, cqId, `✅ ${res.title} добавлена`);
  await sendTelegramDirect(
    cfg,
    `🎉 <b>${esc(res.title)}</b> добавлена — ${formatMoney(res.amount, res.currencyCode)}, следующее списание ${formatDate(res.nextPaymentDate)}.`,
  );
  const allDone = p.added.size >= p.items.length;
  const r = renderDrafts(pid, p);
  await editMessage(
    cfg,
    chatId,
    messageId,
    `🤖 <b>Импорт:</b>\n\n${r.text}${allDone ? "\n\nВсе добавлены 🎉" : ""}`,
    allDone ? undefined : r.keyboard,
  );
}

function cycleLabel(it: ParsedSub): string {
  const base =
    it.cycle === "MONTHLY"
      ? "в месяц"
      : it.cycle === "QUARTERLY"
        ? "в квартал"
        : it.cycle === "YEARLY"
          ? "в год"
          : `раз в ${it.unitDays ?? 30} дн.`;
  return it.every > 1 ? `${base} ×${it.every}` : base;
}

// ---------- commands ----------

async function sendHelp(cfg: TelegramConfig): Promise<void> {
  await send(
    cfg,
    `👋 <b>Subs-бот</b>\n\n` +
      `/upcoming — списания на 7 дней\n` +
      `/today — списания сегодня\n` +
      `/overdue — просроченные\n` +
      `/paid — отметить оплату\n` +
      `/month — расходы за месяц\n` +
      `/add — добавить текстом: <code>/add Netflix 999₽ в месяц</code>\n\n` +
      `📷 Пришлите скриншот страницы оплаты — AI сам всё распознает.\n` +
      `Кнопка <b>✅</b> рядом со списанием отмечает его оплаченным и сдвигает дату.`,
    [
      [
        { text: "📅 Ближайшие", callback_data: "cmd:u" },
        { text: "📊 Месяц", callback_data: "cmd:m" },
      ],
      [
        { text: "⚠️ Просроченные", callback_data: "cmd:o" },
        { text: "✅ Отметить", callback_data: "cmd:p" },
      ],
    ],
  );
}

async function sendMonth(cfg: TelegramConfig): Promise<void> {
  const user = await prisma.user.findFirst({ include: { displayCurrency: true } });
  const displayCode = user?.displayCurrency?.code ?? "USD";
  const month = monthRange();
  const [subs, payroll] = await Promise.all([
    prisma.subscription.findMany({ where: { active: true }, include: { currency: true } }),
    prisma.salaryPayment.findMany({
      where: { paidAt: { gte: month.start, lt: month.end } },
      include: { currency: true },
    }),
  ]);
  const subConv = await Promise.all(
    subs.map((s) =>
      convertAmount(
        monthlyEquivalent(Number(s.amount), s.billingCycle, s.billingEvery, s.billingUnitDays),
        s.currency.code,
        displayCode,
      ),
    ),
  );
  const payConv = await Promise.all(
    payroll.map((p) => convertAmount(Number(p.amount), p.currency.code, displayCode)),
  );
  const sum = (arr: (number | null)[]) =>
    arr.reduce<number | null>((a, v) => (v == null ? null : a == null ? null : a + v), 0);
  const subsTotal = sum(subConv);
  const payTotal = sum(payConv);
  const fmt = (v: number | null) => (v == null ? "?" : formatMoney(v, displayCode));

  await send(
    cfg,
    `📊 <b>${esc(month.label)}</b>\n\n` +
      `Подписки (экв./мес): <b>${fmt(subsTotal)}</b> · ${subs.length} шт.\n` +
      `ЗП за месяц: <b>${fmt(payTotal)}</b> · ${payroll.length} выплат\n` +
      (subsTotal != null || payTotal != null
        ? `\nИтого нагрузка: <b>${fmt((subsTotal ?? 0) + (payTotal ?? 0))}</b>`
        : ""),
  );
}

type ListKind = Ctx;

async function sendList(cfg: TelegramConfig, kind: ListKind): Promise<void> {
  const list = await buildList(kind);
  await send(cfg, list.text, list.keyboard);
}

async function buildList(kind: ListKind): Promise<{ text: string; keyboard?: InlineButton[][] }> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  let where: Record<string, unknown>;
  let title: string;
  let empty: string;
  let withButtons = true;
  switch (kind) {
    case "u":
      where = { active: true, nextPaymentDate: { gt: now, lte: new Date(startOfToday.getTime() + 7 * DAY_MS) } };
      title = "📅 <b>Списания на 7 дней</b>";
      empty = "На ближайшие 7 дней списаний нет 🎉";
      withButtons = false;
      break;
    case "d":
      where = { active: true, nextPaymentDate: { gte: startOfToday, lt: new Date(startOfToday.getTime() + DAY_MS) } };
      title = "💸 <b>Списания сегодня</b>";
      empty = "Сегодня списаний нет.";
      break;
    case "o":
    case "p":
      where = { active: true, nextPaymentDate: { lt: startOfToday } };
      title = kind === "o" ? "⚠️ <b>Просроченные</b>" : "✅ <b>Отметить оплату</b>";
      empty = "Просроченных нет — всё оплачено 🎉";
      break;
  }

  const subs = await prisma.subscription.findMany({
    where,
    include: { currency: true },
    orderBy: { nextPaymentDate: "asc" },
    take: 10,
  });
  if (subs.length === 0) return { text: empty };

  const lines = subs.map((s) => {
    const days = Math.ceil((s.nextPaymentDate.getTime() - startOfToday.getTime()) / DAY_MS);
    const when =
      kind === "u" ? ` · ${daysLabel(days)}` : kind === "d" ? "" : ` · просрочено ${-days} ${plural(-days)}`;
    return `• <b>${esc(s.title)}</b> — ${formatMoney(Number(s.amount), s.currency.code)}${when}`;
  });

  const keyboard = withButtons
    ? subs.map((s) => [{ text: `✅ ${s.title}`, callback_data: `paid:${kind}:${s.id}` }])
    : undefined;

  return { text: `${title}\n\n${lines.join("\n")}`, keyboard };
}

// ---------- helpers ----------

async function send(cfg: TelegramConfig, text: string, keyboard?: InlineButton[][]): Promise<void> {
  await tgCall(cfg, "sendMessage", {
    chat_id: cfg.chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

async function sendTelegramDirect(cfg: TelegramConfig, text: string): Promise<void> {
  await send(cfg, text);
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function plural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "дня";
  return "дней";
}

function daysLabel(days: number): string {
  if (days <= 0) return "сегодня";
  if (days === 1) return "завтра";
  return `через ${days} ${plural(days)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
