"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { encrypt } from "@/lib/crypto";
import {
  generateTotpSecret, buildOtpAuthUri, verifyTotp,
  generateBackupCodes, hashBackupCode,
} from "@/lib/totp";
import { validateBotToken, sendTelegram } from "@/lib/telegram";
import { fetchAndStoreRates } from "@/lib/fetch-rates";
import { runNotifications } from "@/lib/notify";

// ---- Profile ----
const ProfileSchema = z.object({
  email: z.string().email().max(200),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(200).optional(),
  displayCurrencyId: z.string().min(1),
});

export type SettingsState = { ok: boolean; error?: string; backupCodes?: string[]; qrUri?: string; secret?: string; ratesSaved?: number };

export async function updateProfile(_prev: SettingsState | undefined, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = ProfileSchema.safeParse({
    email: formData.get("email"),
    currentPassword: formData.get("currentPassword") || undefined,
    newPassword: formData.get("newPassword") || undefined,
    displayCurrencyId: formData.get("displayCurrencyId"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const d = parsed.data;
  const data: Record<string, unknown> = { email: d.email, displayCurrencyId: d.displayCurrencyId };

  if (d.newPassword) {
    if (!d.currentPassword) return { ok: false, error: "Введите текущий пароль" };
    const okCur = await verifyPassword(d.currentPassword, user.passwordHash);
    if (!okCur) return { ok: false, error: "Неверный текущий пароль" };
    data["passwordHash"] = await hashPassword(d.newPassword);
  }

  await prisma.user.update({ where: { id: user.id }, data });
  await audit("PROFILE_UPDATE", { entity: user.id });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---- 2FA: start (returns QR + secret, NOT yet enabled) ----
export async function beginTwoFactorSetup(): Promise<SettingsState> {
  const user = await requireUser();
  const secret = generateTotpSecret();
  const uri = buildOtpAuthUri(user.email, secret);
  // stash the unencrypted secret server-side in a short-lived cookie-less store?
  // We return it to the client to keep in form state until verification.
  return { ok: true, qrUri: uri, secret };
}

// ---- 2FA: verify & enable ----
const Enable2FASchema = z.object({ secret: z.string().min(1), code: z.string().regex(/^\d{6}$/) });

export async function enableTwoFactor(_prev: SettingsState | undefined, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = Enable2FASchema.safeParse({
    secret: formData.get("secret"),
    code: formData.get("code"),
  });
  if (!parsed.success) return { ok: false, error: "Введите 6-значный код" };
  if (!verifyTotp(parsed.data.code, parsed.data.secret)) {
    return { ok: false, error: "Неверный код" };
  }
  const cipher = encrypt(parsed.data.secret);
  const backups = generateBackupCodes();
  const hashes = backups.map(hashBackupCode);
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretCipher: cipher, twoFactorEnabled: true, backupCodesHash: hashes },
  });
  await audit("2FA_ENABLE", { entity: user.id });
  revalidatePath("/settings");
  return { ok: true, backupCodes: backups };
}

export async function disableTwoFactor(): Promise<SettingsState> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretCipher: null, twoFactorEnabled: false, backupCodesHash: [] },
  });
  await audit("2FA_DISABLE", { entity: user.id });
  revalidatePath("/settings");
  return { ok: true };
}

// ---- Currency override ----
const OverrideSchema = z.object({ currencyId: z.string().min(1), overrideRateToBase: z.coerce.number().positive().optional() });

export async function updateCurrencyOverride(_prev: SettingsState | undefined, formData: FormData): Promise<SettingsState> {
  await requireUser();
  const parsed = OverrideSchema.safeParse({
    currencyId: formData.get("currencyId"),
    overrideRateToBase: formData.get("overrideRateToBase") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Неверные данные" };
  await prisma.currency.update({
    where: { id: parsed.data.currencyId },
    data: { overrideRateToBase: parsed.data.overrideRateToBase ?? null },
  });
  await audit("CURRENCY_UPDATE", { entity: parsed.data.currencyId });
  revalidatePath("/settings");
  revalidatePath("/statistics");
  return { ok: true };
}

// ---- Currency rates: fetch fresh snapshots now (same as cron) ----
export async function refreshRates(): Promise<SettingsState> {
  await requireUser();
  const res = await fetchAndStoreRates();
  if (!res.ok) return { ok: false, error: res.error ?? "Не удалось получить курсы" };
  await audit("CURRENCY_UPDATE", { entity: "refresh" });
  revalidatePath("/settings");
  revalidatePath("/statistics");
  revalidatePath("/dashboard");
  return { ok: true, ratesSaved: res.saved };
}

// ---- Telegram ----
const TelegramSchema = z.object({
  botToken: z.string().min(10).max(300),
  chatId: z.string().min(1).max(100),
  notifyUpcoming: z.coerce.boolean().optional(),
  notifyPaid: z.coerce.boolean().optional(),
  notifyPayroll: z.coerce.boolean().optional(),
  notifySummary: z.coerce.boolean().optional(),
  notifyDays: z.string().optional(),
});

export async function saveTelegram(_prev: SettingsState | undefined, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = TelegramSchema.safeParse({
    botToken: formData.get("botToken"),
    chatId: formData.get("chatId"),
    notifyUpcoming: formData.get("notifyUpcoming") === "on",
    notifyPaid: formData.get("notifyPaid") === "on",
    notifyPayroll: formData.get("notifyPayroll") === "on",
    notifySummary: formData.get("notifySummary") === "on",
    notifyDays: formData.get("notifyDays") || "1,3",
  });
  if (!parsed.success) return { ok: false, error: "Неверные данные" };

  const valid = await validateBotToken(parsed.data.botToken);
  if (!valid.ok) return { ok: false, error: valid.error ?? "Неверный токен бота" };

  const cipher = encrypt(parsed.data.botToken);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramBotTokenCipher: cipher,
      telegramChatId: parsed.data.chatId,
      telegramNotifyUpcoming: parsed.data.notifyUpcoming ?? true,
      telegramNotifyPaid: parsed.data.notifyPaid ?? true,
      telegramNotifyPayroll: parsed.data.notifyPayroll ?? true,
      telegramNotifySummary: parsed.data.notifySummary ?? true,
      telegramNotifyDays: parsed.data.notifyDays ?? "1,3",
    },
  });
  await audit("TELEGRAM_UPDATE", { entity: user.id });
  revalidatePath("/settings");
  return { ok: true };
}

export async function testTelegram(): Promise<SettingsState> {
  const user = await requireUser();
  if (!user.telegramBotTokenCipher || !user.telegramChatId) {
    return { ok: false, error: "Сначала сохраните токен и chat_id" };
  }
  const sent = await sendTelegram("✅ Тестовое сообщение от <b>Subs</b> — уведомления работают.");
  return sent ? { ok: true } : { ok: false, error: "Не удалось отправить. Проверьте токен и chat_id." };
}

export async function clearTelegram(): Promise<SettingsState> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramBotTokenCipher: null, telegramChatId: null },
  });
  await audit("TELEGRAM_UPDATE", { entity: user.id });
  revalidatePath("/settings");
  return { ok: true };
}

// ---- Telegram notify toggles: saved instantly from the configured view ----
export async function updateNotifyFlags(flags: {
  upcoming: boolean; paid: boolean; payroll: boolean; summary: boolean;
}): Promise<SettingsState> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramNotifyUpcoming: !!flags.upcoming,
      telegramNotifyPaid: !!flags.paid,
      telegramNotifyPayroll: !!flags.payroll,
      telegramNotifySummary: !!flags.summary,
    },
  });
  revalidatePath("/settings");
  return { ok: true };
}

/** Manually trigger the daily notification run (same as the scheduler/cron). */
export async function runNotificationsNow(): Promise<SettingsState> {
  await requireUser();
  const res = await runNotifications();
  if (!res.sent) return { ok: false, error: "Нечего отправлять (уже отправлено сегодня или нет событий)" };
  return { ok: true };
}