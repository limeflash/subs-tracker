/**
 * Billing-cycle helpers. Compute the next payment date given a start date,
 * cycle unit, every-N multiplier, and optional custom day count.
 */

export type BillingCycle = "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";

export interface BillingConfig {
  cycle: BillingCycle;
  every: number; // N units
  unitDays?: number | null; // for CUSTOM
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  // clamp to month length (e.g. Jan 31 + 1 month -> Feb 28/29)
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
}

function addYears(d: Date, years: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setFullYear(r.getFullYear() + years);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
}

/** Add exactly one billing period to `from`. */
export function addPeriod(from: Date, cfg: BillingConfig): Date {
  const n = Math.max(1, cfg.every);
  switch (cfg.cycle) {
    case "MONTHLY":
      return addMonths(from, n);
    case "QUARTERLY":
      return addMonths(from, n * 3);
    case "YEARLY":
      return addYears(from, n);
    case "CUSTOM":
      return new Date(from.getTime() + Math.max(1, cfg.unitDays ?? 30) * n * 86_400_000);
  }
}

/**
 * Given the start date and a reference "now", compute the first future payment
 * date (rolling forward over whole periods). Used when (re)computing schedules.
 */
export function nextPaymentFrom(start: Date, now: Date, cfg: BillingConfig): Date {
  let d = new Date(start);
  // roll forward until d > now
  // safety cap to avoid infinite loops on weird data
  for (let i = 0; i < 1000 && d.getTime() <= now.getTime(); i++) {
    d = addPeriod(d, cfg);
  }
  return d;
}