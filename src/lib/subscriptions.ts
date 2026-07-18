import { prisma } from "@/lib/db";
import { addPeriod, type BillingCycle } from "@/lib/periods";

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
