import { prisma } from "@/lib/db";

/**
 * Fetch fresh exchange rates for ALL tracked currencies and persist a full
 * matrix of base->quote snapshots (every ordered pair). Idempotent per
 * (base, quote, date).
 *
 * We fetch each currency's rate table (1 unit of it -> N of every other),
 * so inverse and cross pairs (EUR->USD, EUR->RUB, TRY->EUR, …) get fresh rows
 * too — not just base->quote. Without this, only base->quote is refreshed and
 * the inverse rows go stale forever, which the converter (and Settings
 * display) then surfaces as outdated rates.
 *
 * Providers tried in order (all free, no API key required):
 *   1. open.er-api.com  — covers USD/TRY/EUR/RUB and 250+ more; robust.
 *   2. frankfurter.app  — ECB reference rates; good fallback but has NO RUB
 *      (ECB stopped publishing RUB), so RUB pairs will skip this provider.
 * If every provider fails we leave the existing latest snapshot untouched
 * (the converter falls back to it) and report the error.
 */
export async function fetchAndStoreRates(): Promise<{ ok: boolean; saved: number; error?: string }> {
  const currencies = await prisma.currency.findMany();
  if (currencies.length < 2) return { ok: true, saved: 0 };

  const today = utcDay(new Date());
  const now = new Date();
  const byCode = new Map(currencies.map((c) => [c.code, c]));

  let saved = 0;
  let anyOk = false;

  // For each currency as a base, fetch its rate table and persist every
  // base->quote pair where both currencies are tracked.
  for (const base of currencies) {
    const quotes = currencies.filter((c) => c.id !== base.id).map((c) => c.code);
    const rates = await fetchRates(base.code, quotes);
    if (!rates) continue; // provider down for this base; skip, others may succeed
    anyOk = true;
    for (const qCode of quotes) {
      const rate = rates[qCode];
      if (typeof rate !== "number" || !isFinite(rate) || rate <= 0) continue;
      const quote = byCode.get(qCode);
      if (!quote) continue;
      await prisma.exchangeRate.upsert({
        where: { baseId_quoteId_date: { baseId: base.id, quoteId: quote.id, date: today } },
        update: { rate, fetchedAt: now },
        create: { baseId: base.id, quoteId: quote.id, rate, date: today },
      });
      saved++;
    }
  }

  if (!anyOk) {
    return { ok: false, saved: 0, error: "all rate providers unavailable" };
  }
  return { ok: true, saved };
}

const UA = "Mozilla/5.0 (compatible; SubsTracker/1.0)";

/** Try providers in order; return base->quote rate map or null if all fail. */
async function fetchRates(baseCode: string, quoteCodes: string[]): Promise<Record<string, number> | null> {
  const fromErApi = await tryErApi(baseCode);
  if (fromErApi) return filterQuotes(fromErApi, quoteCodes);

  const fromFrankfurter = await tryFrankfurter(baseCode, quoteCodes);
  if (fromFrankfurter) return fromFrankfurter;

  return null;
}

/**
 * open.er-api.com — free, no key. Response shape:
 *   { result: "success", base: "USD", rates: { TRY: 32.6, EUR: 0.92, RUB: 91.5, ... } }
 */
async function tryErApi(baseCode: string): Promise<Record<string, number> | null> {
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(baseCode)}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (json.result !== "success" || !json.rates) return null;
    return json.rates;
  } catch {
    return null;
  }
}

/**
 * frankfurter.app — ECB reference rates, free, no key. Has no RUB.
 * Supports base/symbols. Returns { rates: { ... } }.
 */
async function tryFrankfurter(baseCode: string, quoteCodes: string[]): Promise<Record<string, number> | null> {
  // ECB doesn't publish RUB; drop it so the request doesn't 422 on an unknown symbol.
  const symbols = quoteCodes.filter((c) => c.toUpperCase() !== "RUB");
  if (symbols.length === 0) return null;
  const url = `https://api.frankfurter.app/latest?base=${encodeURIComponent(baseCode)}&symbols=${symbols.join(",")}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    if (!json.rates) return null;
    return json.rates;
  } catch {
    return null;
  }
}

function filterQuotes(rates: Record<string, number>, quoteCodes: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const code of quoteCodes) {
    const v = rates[code];
    if (typeof v === "number" && isFinite(v) && v > 0) out[code] = v;
  }
  return out;
}

/**
 * Calendar day of `d` in UTC, as a Date at 00:00 UTC. Using UTC (not the
 * container's local TZ) so the prod container (UTC) and any dev host (e.g.
 * +03) write the same `date` for the same instant — otherwise upserts miss
 * each other and stale rows survive as "latest" by calendar date.
 */
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}