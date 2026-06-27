import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";

const PRE_AUTH_COOKIE = "subs_preauth";
const TWOFA_COOKIE = "subs_2faok";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET not set");
  return new TextEncoder().encode(s);
}

/**
 * Use Secure cookies only behind HTTPS — detected from NEXTAUTH_URL (https://)
 * or the reverse-proxy's X-Forwarded-Proto header. On plain-HTTP localhost
 * dev we leave Secure off so login still works.
 */
async function secureCookies(): Promise<boolean> {
  const url = process.env.NEXTAUTH_URL ?? "";
  if (url.startsWith("https://")) return true;
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto");
    if (proto && proto.toLowerCase().includes("https")) return true;
  } catch {
    /* headers unavailable in this context — fall back to NEXTAUTH_URL only */
  }
  return false;
}

/** Issued after password check; permits the 2FA step. TTL 5 min. */
export async function setPreAuthCookie(email: string) {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
  const jar = await cookies();
  jar.set(PRE_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: await secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 5 * 60,
  });
}

export async function getPreAuthEmail(): Promise<string | null> {
  const jar = await cookies();
  const tok = jar.get(PRE_AUTH_COOKIE)?.value;
  if (!tok) return null;
  try {
    const { payload } = await jwtVerify(tok, secret());
    return (payload as { email: string }).email ?? null;
  } catch {
    return null;
  }
}

export async function clearPreAuthCookie() {
  const jar = await cookies();
  jar.delete(PRE_AUTH_COOKIE);
}

/**
 * Issued after 2FA success. A Credentials provider reads this to know
 * the user cleared 2FA this session — without it the provider refuses.
 */
export async function setTwoFactorOkCookie(email: string) {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
  const jar = await cookies();
  jar.set(TWOFA_COOKIE, token, {
    httpOnly: true,
    secure: await secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
}

export async function consumeTwoFactorOkCookie(
  expectedEmail: string,
): Promise<boolean> {
  const jar = await cookies();
  const tok = jar.get(TWOFA_COOKIE)?.value;
  // always delete — one-shot
  jar.delete(TWOFA_COOKIE);
  if (!tok) return false;
  try {
    const { payload } = await jwtVerify(tok, secret());
    return (payload as { email: string }).email === expectedEmail;
  } catch {
    return false;
  }
}

/** Has 2FA been completed already for the current pre-auth session? */
export async function hasTwoFactorOkCookie(): Promise<boolean> {
  const jar = await cookies();
  return !!jar.get(TWOFA_COOKIE)?.value;
}