import { prisma } from "@/lib/db";
import type { Currency } from "@prisma/client";

/**
 * Full currency converter.
 *
 * Resolution order for the multiplier from `from` to `to`:
 *   1. identity (from === to)
 *   2. direct ExchangeRate snapshot  (from -> to)
 *   3. inverse ExchangeRate snapshot (to -> from, inverted)
 *   4. via base currency, using an *effective* "to base" rate for each leg:
 *        - explicit `overrideRateToBase` if the user set one, else
 *        - latest snapshot to the base currency (direct / inverse)
 *      rate = effectiveToBase(from) / effectiveToBase(to)
 *
 * Returns null when no rate can be derived — callers mark the value as unknown.
 */
export async function convertAmount(
  amount: number,
  fromCode: string,
  toCode: string,
): Promise<number | null> {
  if (fromCode === toCode) return amount;

  const [from, to] = await Promise.all([
    prisma.currency.findUnique({ where: { code: fromCode } }),
    prisma.currency.findUnique({ where: { code: toCode } }),
  ]);
  if (!from || !to) return null;

  const rate = await rateFromTo(from, to);
  if (rate == null || !isFinite(rate) || rate === 0) return null;
  return amount * rate;
}

/** Multiplier to turn 1 unit of `from` into `to`. null if unavailable. */
async function rateFromTo(from: Currency, to: Currency): Promise<number | null> {
  // 1. direct snapshot
  const direct = await prisma.exchangeRate.findFirst({
    where: { baseId: from.id, quoteId: to.id },
    orderBy: { fetchedAt: "desc" },
  });
  if (direct) return Number(direct.rate);

  // 2. inverse snapshot
  const inverse = await prisma.exchangeRate.findFirst({
    where: { baseId: to.id, quoteId: from.id },
    orderBy: { fetchedAt: "desc" },
  });
  if (inverse) {
    const r = Number(inverse.rate);
    if (r !== 0) return 1 / r;
  }

  // 3. via base, override-aware
  const base = await prisma.currency.findFirst({ where: { isBase: true } });
  if (!base) return null;
  const [fromToBase, toToBase] = await Promise.all([
    effectiveToBase(from, base),
    effectiveToBase(to, base),
  ]);
  if (fromToBase == null || toToBase == null || toToBase === 0) return null;
  return fromToBase / toToBase;
}

/**
 * Latest *market* snapshot rate of `cur` against `base` (ignores override):
 * 1 unit of `cur` = N units of `base`. Returns {rate, date} or null.
 * `date` is the fetchedAt instant (when the cron pulled this rate) — used by
 * Settings to show "от <date>". Ordered by fetchedAt so the most-recently
 * fetched row wins even when a stale earlier calendar-date row exists.
 */
export async function latestSnapshotToBase(
  cur: Currency,
  base: Currency,
): Promise<{ rate: number; date: Date } | null> {
  if (cur.id === base.id) return null;

  const direct = await prisma.exchangeRate.findFirst({
    where: { baseId: cur.id, quoteId: base.id },
    orderBy: { fetchedAt: "desc" },
  });
  if (direct) return { rate: Number(direct.rate), date: direct.fetchedAt };

  const inverse = await prisma.exchangeRate.findFirst({
    where: { baseId: base.id, quoteId: cur.id },
    orderBy: { fetchedAt: "desc" },
  });
  if (inverse) {
    const r = Number(inverse.rate);
    if (r !== 0) return { rate: 1 / r, date: inverse.fetchedAt };
  }
  return null;
}

/**
 * Effective multiplier "1 unit of `cur` => N units of `base`".
 * Prefers the user's manual `overrideRateToBase`, then the latest snapshot
 * (cur->base direct, or base->cur inverted). 1 if cur is the base itself.
 */
async function effectiveToBase(cur: Currency, base: Currency): Promise<number | null> {
  if (cur.id === base.id) return 1;

  if (cur.overrideRateToBase != null) {
    const r = Number(cur.overrideRateToBase);
    if (isFinite(r) && r > 0) return r;
  }

  const direct = await prisma.exchangeRate.findFirst({
    where: { baseId: cur.id, quoteId: base.id },
    orderBy: { fetchedAt: "desc" },
  });
  if (direct) return Number(direct.rate);

  const inverse = await prisma.exchangeRate.findFirst({
    where: { baseId: base.id, quoteId: cur.id },
    orderBy: { fetchedAt: "desc" },
  });
  if (inverse) {
    const r = Number(inverse.rate);
    if (r !== 0) return 1 / r;
  }

  return null;
}

/** Monthly-equivalent cost of a subscription in a target currency. */
export function monthlyEquivalent(amount: number, cycle: string, every: number, unitDays?: number | null): number {
  const n = Math.max(1, every);
  switch (cycle) {
    case "MONTHLY":
      return amount / n;
    case "QUARTERLY":
      return (amount / n) / 3;
    case "YEARLY":
      return (amount / n) / 12;
    case "CUSTOM": {
      const days = Math.max(1, unitDays ?? 30) * n;
      return (amount / days) * 30;
    }
    default:
      return amount;
  }
}