import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32; // 256-bit
const IV_LEN = 16; // GCM standard 12 is fine too, we use 12
const IV_LEN_ACTUAL = 12;
const SALT_LEN = 16;
const TAG_LEN = 16;

/**
 * Resolve the master encryption key (32 bytes) from env.
 * In production, ENCRYPTION_KEY MUST be a base64-encoded 32-byte string
 * (e.g. `openssl rand -base64 32`). Any other shape throws — never silently
 * derive from a weak passphrase at runtime, since changing the derivation
 * later would make existing ciphertext undecryptable.
 *
 * In NODE_ENV !== "production" we tolerate a UTF-8 passphrase (derived via
 * scrypt with a fixed salt) purely for local dev convenience. This MUST NOT
 * be relied on in prod.
 */
export function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate with: openssl rand -base64 32",
    );
  }
  // Try base64 first — always the accepted form.
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === KEY_LEN) return buf;
  } catch {
    /* not base64 */
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_KEY must be a base64-encoded 32-byte string in production. " +
        "Generate with: openssl rand -base64 32",
    );
  }
  // Dev/test only: derive a deterministic key from a passphrase.
  const salt = Buffer.alloc(SALT_LEN, 0); // deterministic so re-derivation matches
  return scryptSync(raw, salt, KEY_LEN);
}

export interface CipherBlob {
  /** base64 of iv || ciphertext || tag */
  v: string;
}

/**
 * AES-256-GCM encryption. Returns base64 of iv(12) || ciphertext || tag(16).
 * Authenticated: tampering with the blob fails on decrypt.
 */
export function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN_ACTUAL);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

/** Decrypt a blob produced by encrypt(). Throws on tamper / wrong key. */
export function decrypt(blob: string): string {
  const key = getMasterKey();
  const data = Buffer.from(blob, "base64");
  if (data.length < IV_LEN_ACTUAL + TAG_LEN) {
    throw new Error("Invalid ciphertext blob");
  }
  const iv = data.subarray(0, IV_LEN_ACTUAL);
  const tag = data.subarray(data.length - TAG_LEN);
  const enc = data.subarray(IV_LEN_ACTUAL, data.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

/** Constant-time string comparison for backup codes etc. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Constant-time comparison for secrets of possibly different lengths (e.g.
 * cron bearer tokens). Unlike safeEqual, unequal length does NOT short-circuit
 * the timing channel — we still hash both into a fixed-size digest and compare
 * those, so the time taken is independent of whether the lengths match.
 */
export function safeSecretEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}