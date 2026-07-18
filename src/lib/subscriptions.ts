import { prisma } from "@/lib/db";
import { addPeriod, nextPaymentFrom, type BillingCycle } from "@/lib/periods";
import { resolveFavicon } from "@/lib/favicon";
import { resolveCurrencyId, type ParsedSub } from "@/lib/ai";

/**
 * Core "mark as paid" logic shared by the web UI (server action) and the
 * Telegram bot. Advances the schedule by one period and returns details for
 * a confirmation message. null = subscription not found.
 */
export async function markSubscriptionPaid(id: string): Promise<{
  title: string;
  amount: number;
  currencyCode: string;
  nextPaymentDate: Date;
} | null> {
  const sub = await prisma.subscription.findUnique({ where: { id }, include: { currency: true } });
  if (!sub) return null;
  const cfg = {
    cycle: sub.billingCycle as BillingCycle,
    every: sub.billingEvery,
    unitDays: sub.billingUnitDays,
  };
  const next = addPeriod(sub.nextPaymentDate, cfg);
  await prisma.subscription.update({ where: { id }, data: { nextPaymentDate: next } });
  return {
    title: sub.title,
    amount: Number(sub.amount),
    currencyCode: sub.currency.code,
    nextPaymentDate: next,
  };
}

/**
 * Create a subscription from AI-parsed data (screenshot/text import, bot).
 * Resolves/creates the currency, computes the schedule, fetches favicon.
 */
export async function createFromParsed(item: ParsedSub): Promise<{
  id: string; title: string; amount: number; currencyCode: string; nextPaymentDate: Date;
} | { error: string }> {
  const currencyId = await resolveCurrencyId(item.currency);
  if (!currencyId) return { error: `Неизвестная валюта ${item.currency}` };

  const cfg = {
    cycle: item.cycle as BillingCycle,
    every: item.every,
    unitDays: item.unitDays ?? null,
  };
  const now = new Date();
  const parsed = item.nextPaymentDate ? new Date(`${item.nextPaymentDate}T12:00:00`) : null;
  const start = parsed && !isNaN(parsed.getTime()) ? parsed : now;
  const next = start.getTime() > now.getTime() ? start : nextPaymentFrom(start, now, cfg);

  let faviconUrl: string | null = null;
  if (item.url) {
    try {
      faviconUrl = await resolveFavicon(item.url);
    } catch {
      faviconUrl = null;
    }
  }

  const sub = await prisma.subscription.create({
    data: {
      title: item.title,
      url: item.url || null,
      faviconUrl,
      amount: item.amount,
      currencyId,
      billingCycle: item.cycle,
      billingEvery: item.every,
      billingUnitDays: item.unitDays ?? null,
      startDate: start,
      nextPaymentDate: next,
      notes: item.notes || null,
    },
    include: { currency: true },
  });
  return {
    id: sub.id,
    title: sub.title,
    amount: Number(sub.amount),
    currencyCode: sub.currency.code,
    nextPaymentDate: sub.nextPaymentDate,
  };
}
