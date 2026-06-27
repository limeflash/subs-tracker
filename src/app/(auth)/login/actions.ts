"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { checkRate, recordFailure, resetRate } from "@/lib/rate-limit";
import {
  setPreAuthCookie,
  getPreAuthEmail,
  setTwoFactorOkCookie,
  clearPreAuthCookie,
} from "@/lib/cookies";
import { decrypt, safeEqual } from "@/lib/crypto";
import { verifyTotp, hashBackupCode } from "@/lib/totp";
import { signIn } from "@/auth";
import { getAuthError } from "@/lib/auth-errors";

const EmailPassSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

const TotpSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const BackupSchema = z.object({
  backupCode: z.string().min(8).max(20),
});

// A baked argon2id *hash of a guessable string* — used to keep timing similar
// when the account doesn't exist (no enumeration leak). Cheap to produce at
// build is not possible; this is a placeholder hash of "ephemeral"/"empty".
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAQ$evs8u7b6y2l+fBVjD7x2z3pROj9+8mJ7p8r8yUXr2Rk";

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const xf = h.get("x-forwarded-for");
  return xf ? xf.split(",")[0]?.trim() ?? null : null;
}

export interface LoginState {
  ok: boolean;
  error?: string;
}

/** Step 1: verify password; if 2FA on, set pre-auth cookie and go to /login/2fa. */
export async function loginStep1(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");
  const parsed = EmailPassSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "Неверный ввод" };

  const email = parsed.data.email.toLowerCase().trim();
  const rateKey = `login:${email}`;

  if (!checkRate(rateKey).ok) {
    return { ok: false, error: "Слишком много попыток. Попробуйте позже." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : await verifyPassword(parsed.data.password, DUMMY_HASH);

  if (!user || !ok) {
    recordFailure(rateKey);
    await audit("LOGIN_BAD_PASS", { meta: { email }, ip: await clientIp() });
    return { ok: false, error: "Неверный email или пароль" };
  }

  resetRate(rateKey);

  if (user.twoFactorEnabled) {
    await setPreAuthCookie(email);
    redirect(
      `/login/2fa${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`,
    );
  }

  // No 2FA: set one-shot cookie and sign in directly with the real password.
  await setTwoFactorOkCookie(email);
  await audit("LOGIN_OK", { meta: { email }, ip: await clientIp() });
  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (e) {
    return { ok: false, error: getAuthError(e) };
  }
  redirect(callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard");
}

/** Step 2: verify TOTP/backup code, then sign in via the "__2fa__" sentinel. */
export async function loginStep2(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");
  const email = await getPreAuthEmail();
  if (!email) return { ok: false, error: "Сессия истекла. Начните вход заново." };

  const code = String(formData.get("code") ?? "").trim();
  const backupCode = String(formData.get("backupCode") ?? "").trim();
  const rateKey = `2fa:${email}`;

  if (!checkRate(rateKey).ok) {
    return { ok: false, error: "Слишком много попыток. Попробуйте позже." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.twoFactorEnabled || !user.totpSecretCipher) {
    await clearPreAuthCookie();
    return { ok: false, error: "2FA не настроена. Начните вход заново." };
  }

  let success = false;
  let usedBackup = false;

  if (TotpSchema.safeParse({ code }).success) {
    try {
      const secret = decrypt(user.totpSecretCipher);
      success = verifyTotp(code, secret);
    } catch {
      success = false;
    }
  } else if (BackupSchema.safeParse({ backupCode }).success) {
    const providedHash = hashBackupCode(backupCode);
    const idx = user.backupCodesHash.findIndex((h) => safeEqual(providedHash, h));
    if (idx >= 0) {
      // Race-safe removal: only delete the exact remaining hash set we matched
      // against. If a concurrent request already consumed it, updateMany
      // affects zero rows and we treat the code as already used (fail closed).
      const target = user.backupCodesHash[idx];
      const remaining = user.backupCodesHash.filter((_, i) => i !== idx);
      const upd = await prisma.user.updateMany({
        where: { id: user.id, backupCodesHash: { equals: user.backupCodesHash } },
        data: { backupCodesHash: remaining },
      });
      if (upd.count === 0) {
        // Already consumed concurrently — do not authenticate.
        success = false;
      } else {
        success = true;
        usedBackup = true;
        void target;
      }
    }
  }

  if (!success) {
    recordFailure(rateKey);
    await audit("LOGIN_2FA_FAIL", {
      meta: { email, backupAttempt: !!backupCode },
      ip: await clientIp(),
    });
    return { ok: false, error: "Неверный код" };
  }

  resetRate(rateKey);
  await setTwoFactorOkCookie(email);
  if (!usedBackup) {
    await audit("LOGIN_2FA_OK", { meta: { email }, ip: await clientIp() });
  } else {
    await audit("LOGIN_BACKUP_USED", { meta: { email }, ip: await clientIp() });
  }
  await audit("LOGIN_OK", { meta: { email, via2FA: true }, ip: await clientIp() });

  try {
    await signIn("credentials", { email, password: "__2fa__", redirect: false });
  } catch (e) {
    return { ok: false, error: getAuthError(e) };
  }
  redirect(callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard");
}