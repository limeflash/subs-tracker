import { authenticator } from "otplib";
import { createHash, randomBytes } from "node:crypto";

// TOTP: 30s window, 6 digits. Allow 1 prior step (~30s drift) by default.
authenticator.options = { ...authenticator.options, window: 1 };

const ISSUER = "Subs";

/** Generate a new base32 TOTP secret. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** Build the otpauth:// URI for QR-code generation. */
export function buildOtpAuthUri(email: string, secret: string): string {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Verify a 6-digit code against the secret. */
export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/** Generate 8 human-readable backup codes, e.g. "A7F2-9KQ1". */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const bytes = randomBytes(5);
    const b32 = bytes.toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
    codes.push(`${b32.slice(0, 4)}-${b32.slice(4)}`);
  }
  return codes;
}

/** Hash a backup code with sha256 (store hashes, compare constant-time). */
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}