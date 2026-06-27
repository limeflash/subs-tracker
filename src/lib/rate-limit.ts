/**
 * Tiny in-memory rate limiter for login attempts. Single-process, single-user app.
 * Not distributed — fine here. Resets after window minutes.
 */

interface Bucket {
  count: number;
  firstAt: number; // ms timestamp of first attempt in current window
}

const LIMIT = 5; // max attempts
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCK_MS = 30 * 60 * 1000; // lockout after too many

const buckets = new Map<string, Bucket>();
const locks = new Map<string, number>(); // key -> lockUntil(ms)

function nowMs(): number {
  return Date.now();
}

export function checkRate(key: string): { ok: boolean; retryAfterMs: number } {
  const lock = locks.get(key);
  if (lock && lock > nowMs()) {
    return { ok: false, retryAfterMs: lock - nowMs() };
  }
  if (lock) locks.delete(key);

  const b = buckets.get(key);
  if (!b) return { ok: true, retryAfterMs: 0 };
  if (nowMs() - b.firstAt > WINDOW_MS) {
    buckets.delete(key);
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count >= LIMIT) {
    const until = nowMs() + LOCK_MS;
    locks.set(key, until);
    buckets.delete(key);
    return { ok: false, retryAfterMs: until - nowMs() };
  }
  return { ok: true, retryAfterMs: 0 };
}

/** Register a failed attempt. Returns updated state. */
export function recordFailure(key: string): { ok: boolean; retryAfterMs: number } {
  let b = buckets.get(key);
  const now = nowMs();
  if (!b || now - b.firstAt > WINDOW_MS) {
    b = { count: 0, firstAt: now };
  }
  b["count"] = b.count + 1;
  buckets.set(key, b);
  if (b.count >= LIMIT) {
    const until = now + LOCK_MS;
    locks.set(key, until);
    buckets.delete(key);
    return { ok: false, retryAfterMs: until - now };
  }
  return { ok: true, retryAfterMs: 0 };
}

export function resetRate(key: string): void {
  buckets.delete(key);
  locks.delete(key);
}