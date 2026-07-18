import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import type { User } from "@prisma/client";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface TgMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; data?: string; message?: TgMessage };
}

/** Load + decrypt the owner's Telegram config. Returns null if not configured. */
export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const user = await prisma.user.findFirst();
  if (!user?.telegramBotTokenCipher || !user?.telegramChatId) return null;
  try {
    const token = decrypt(user.telegramBotTokenCipher);
    return { botToken: token, chatId: user.telegramChatId };
  } catch {
    return null;
  }
}

/** Low-level Bot API call. Returns result payload or null on failure. */
export async function tgCall<T = unknown>(
  cfg: TelegramConfig,
  method: string,
  body: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<T | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return null;
    return json.result as T;
  } catch {
    return null;
  }
}

/** Send a message via Bot API. Best-effort with one retry. */
export async function sendTelegram(
  text: string,
  opts?: { parseMode?: "HTML" | "MarkdownV2"; keyboard?: InlineButton[][] },
): Promise<boolean> {
  const cfg = await getTelegramConfig();
  if (!cfg) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await tgCall(cfg, "sendMessage", {
      chat_id: cfg.chatId,
      text,
      parse_mode: opts?.parseMode ?? "HTML",
      disable_web_page_preview: true,
      ...(opts?.keyboard ? { reply_markup: { inline_keyboard: opts.keyboard } } : {}),
    });
    if (r !== null) return true;
  }
  return false;
}

export async function getUpdates(cfg: TelegramConfig, offset: number, timeoutSec: number): Promise<TgUpdate[] | null> {
  const r = await tgCall<TgUpdate[]>(
    cfg,
    "getUpdates",
    {
      offset,
      timeout: timeoutSec,
      allowed_updates: ["message", "callback_query"],
    },
    timeoutSec * 1000 + 8000,
  );
  if (r === null) return null;
  return Array.isArray(r) ? r : [];
}

export async function answerCallback(cfg: TelegramConfig, id: string, text?: string): Promise<void> {
  await tgCall(cfg, "answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

export async function editMessage(
  cfg: TelegramConfig,
  chatId: string | number,
  messageId: number,
  text: string,
  keyboard?: InlineButton[][],
): Promise<void> {
  await tgCall(cfg, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard && keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : { reply_markup: { inline_keyboard: [] } }),
  });
}

/** Publish the command list shown in Telegram's "/" menu. */
export async function setMyCommands(cfg: TelegramConfig): Promise<void> {
  await tgCall(cfg, "setMyCommands", {
    commands: [
      { command: "upcoming", description: "Списания на 7 дней" },
      { command: "today", description: "Списания сегодня" },
      { command: "overdue", description: "Просроченные" },
      { command: "paid", description: "Отметить оплату" },
      { command: "month", description: "Расходы за месяц" },
      { command: "help", description: "Список команд" },
    ],
  });
}

/** Validate a bot token by calling /getMe. Returns the bot username on success. */
export async function validateBotToken(token: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json();
    if (body.ok) return { ok: true, username: body.result.username };
    return { ok: false, error: body.description ?? "Неверный токен" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function notifyFlags(user: User): { upcoming: boolean; paid: boolean; payroll: boolean; summary: boolean } {
  return {
    upcoming: user.telegramNotifyUpcoming,
    paid: user.telegramNotifyPaid,
    payroll: user.telegramNotifyPayroll,
    summary: user.telegramNotifySummary,
  };
}
