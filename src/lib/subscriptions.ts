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
  if (item.group) await assignGroup(sub.id, item.group);
  return {
    id: sub.id,
    title: sub.title,
    amount: Number(sub.amount),
    currencyCode: sub.currency.code,
    nextPaymentDate: sub.nextPaymentDate,
  };
}

/** Fuzzy-find an active subscription by (AI-provided) title. */
export async function findSubscriptionByTitle(title: string) {
  const subs = await prisma.subscription.findMany({
    where: { active: true },
    include: { currency: true },
  });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").trim();
  const t = norm(title);
  if (!t) return null;
  return (
    subs.find((s) => norm(s.title) === t) ??
    subs.find((s) => {
      const n = norm(s.title);
      return n.includes(t) || t.includes(n);
    }) ??
    null
  );
}

/**
 * Update an existing subscription from AI-parsed data (price/schedule change,
 * new invoice). Only provided fields are touched; group is assigned if given.
 */
export async function updateFromParsed(id: string, item: ParsedSub): Promise<{
  id: string; title: string; amount: number; currencyCode: string; nextPaymentDate: Date;
} | { error: string }> {
  const sub = await prisma.subscription.findUnique({ where: { id }, include: { currency: true } });
  if (!sub) return { error: "Подписка не найдена" };

  const data: Record<string, unknown> = {
    amount: item.amount,
    billingCycle: item.cycle,
    billingEvery: item.every,
    billingUnitDays: item.unitDays ?? null,
  };
  const currencyId = await resolveCurrencyId(item.currency);
  if (currencyId) data.currencyId = currencyId;
  if (item.nextPaymentDate) {
    const d = new Date(`${item.nextPaymentDate}T12:00:00`);
    if (!isNaN(d.getTime())) data.nextPaymentDate = d;
  }
  if (item.url) {
    data.url = item.url;
    try {
      data.faviconUrl = await resolveFavicon(item.url);
    } catch {
      /* keep old */
    }
  }
  if (item.notes) data.notes = item.notes;

  const updated = await prisma.subscription.update({
    where: { id },
    data,
    include: { currency: true },
  });
  if (item.group) await assignGroup(id, item.group);
  return {
    id: updated.id,
    title: updated.title,
    amount: Number(updated.amount),
    currencyCode: updated.currency.code,
    nextPaymentDate: updated.nextPaymentDate,
  };
}

/** Link a subscription to a group by name, creating the group if needed. */
export async function assignGroup(subscriptionId: string, groupName: string): Promise<void> {
  const name = groupName.trim();
  if (!name) return;
  let group = await prisma.group.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (!group) {
    const hue = Math.floor(Math.random() * 360);
    group = await prisma.group.create({
      data: { name, color: `hsl(${hue} 70% 55%)` },
    });
  }
  await prisma.subscriptionGroup.upsert({
    where: { subscriptionId_groupId: { subscriptionId, groupId: group.id } },
    create: { subscriptionId, groupId: group.id },
    update: {},
  });
}

/** Apply one AI action end-to-end (shared by bot and web import). */
export async function applyParsedAction(item: ParsedSub): Promise<
  | { kind: "added" | "updated" | "paid"; id: string; title: string; amount: number; currencyCode: string; nextPaymentDate: Date }
  | { error: string }
> {
  const action = item.action ?? "add";
  if (action === "add") {
    const r = await createFromParsed(item);
    return "error" in r ? r : { kind: "added", ...r };
  }
  const match = item.matchTitle ? await findSubscriptionByTitle(item.matchTitle) : await findSubscriptionByTitle(item.title);
  if (!match) {
    // nothing to update/close — treat as a new subscription instead
    const r = await createFromParsed(item);
    return "error" in r ? r : { kind: "added", ...r };
  }
  if (action === "update") {
    const r = await updateFromParsed(match.id, item);
    return "error" in r ? r : { kind: "updated", ...r };
  }
  const r = await markSubscriptionPaid(match.id);
  if (!r) return { error: "Подписка не найдена" };
  if (item.group) await assignGroup(match.id, item.group);
  return { kind: "paid", id: match.id, ...r };
}
