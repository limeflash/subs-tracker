import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import type { User } from "@prisma/client";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
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

/** Send a message via Bot API. Best-effort with one retry. */
export async function sendTelegram(text: string, opts?: { parseMode?: "HTML" | "MarkdownV2" }): Promise<boolean> {
  const cfg = await getTelegramConfig();
  if (!cfg) return false;
  const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text,
          parse_mode: opts?.parseMode ?? "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return true;
      const body = await res.json().catch(() => null);
      // 401/404 = bad token/chat — no point retrying
      if (res.status === 401 || res.status === 404) return false;
    } catch {
      /* retry */
    }
  }
  return false;
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