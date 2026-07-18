"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveFavicon } from "@/lib/favicon";
import { addPeriod, nextPaymentFrom, type BillingCycle } from "@/lib/periods";
import { notifyMarkedPaid } from "@/lib/notify";
import { requireUser } from "@/lib/session";

const CycleEnum = z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]);

const SubSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url().or(z.literal("")).optional(),
  amount: z.coerce.number().positive().max(1_000_000_000),
  currencyId: z.string().min(1),
  billingCycle: CycleEnum,
  billingEvery: z.coerce.number().int().min(1).max(365),
  billingUnitDays: z.coerce.number().int().min(1).max(3650).optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  groupIds: z.array(z.string()).optional(),
});

export type SubFormState = { ok: boolean; error?: string; id?: string };

export async function createSubscription(
  _prev: SubFormState | undefined,
  formData: FormData,
): Promise<SubFormState> {
  await requireUser();
  const raw = {
    title: formData.get("title"),
    url: formData.get("url") || "",
    amount: formData.get("amount"),
    currencyId: formData.get("currencyId"),
    billingCycle: formData.get("billingCycle"),
    billingEvery: formData.get("billingEvery") || 1,
    billingUnitDays: formData.get("billingUnitDays") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
    notes: formData.get("notes") || undefined,
    groupIds: formData.getAll("groupIds"),
  };
  const parsed = SubSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const d = parsed.data;

  const start = new Date(d.startDate);
  if (isNaN(start.getTime())) return { ok: false, error: "Неверная дата старта" };

  const cfg = { cycle: d.billingCycle as BillingCycle, every: d.billingEvery, unitDays: d.billingUnitDays ?? null };
  const now = new Date();
  const next = start.getTime() > now.getTime() ? start : nextPaymentFrom(start, now, cfg);

  let faviconUrl: string | null = null;
  if (d.url) {
    try {
      faviconUrl = await resolveFavicon(d.url);
    } catch {
      faviconUrl = null;
    }
  }

  const sub = await prisma.subscription.create({
    data: {
      title: d.title,
      url: d.url || null,
      faviconUrl,
      amount: d.amount,
      currencyId: d.currencyId,
      billingCycle: d.billingCycle,
      billingEvery: d.billingEvery,
      billingUnitDays: d.billingUnitDays ?? null,
      startDate: start,
      nextPaymentDate: next,
      endDate: d.endDate ? new Date(d.endDate) : null,
      notes: d.notes || null,
      groups: d.groupIds?.length
        ? { create: d.groupIds.map((groupId) => ({ groupId })) }
        : undefined,
    },
  });

  await audit("SUBSCRIPTION_CREATE", { entity: sub.id, meta: { title: sub.title } });
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  return { ok: true, id: sub.id };
}

export async function updateSubscription(
  id: string,
  formData: FormData,
): Promise<SubFormState> {
  await requireUser();
  const raw = {
    title: formData.get("title"),
    url: formData.get("url") || "",
    amount: formData.get("amount"),
    currencyId: formData.get("currencyId"),
    billingCycle: formData.get("billingCycle"),
    billingEvery: formData.get("billingEvery") || 1,
    billingUnitDays: formData.get("billingUnitDays") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
    notes: formData.get("notes") || undefined,
    groupIds: formData.getAll("groupIds"),
  };
  const parsed = SubSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const d = parsed.data;
  const start = new Date(d.startDate);
  if (isNaN(start.getTime())) return { ok: false, error: "Неверная дата старта" };

  const cfg = { cycle: d.billingCycle as BillingCycle, every: d.billingEvery, unitDays: d.billingUnitDays ?? null };
  const now = new Date();
  const next = start.getTime() > now.getTime() ? start : nextPaymentFrom(start, now, cfg);

  let faviconUrl: string | null = null;
  if (d.url) {
    try {
      faviconUrl = await resolveFavicon(d.url);
    } catch {
      faviconUrl = null;
    }
  }

  await prisma.$transaction([
    prisma.subscriptionGroup.deleteMany({ where: { subscriptionId: id } }),
    prisma.subscription.update({
      where: { id },
      data: {
        title: d.title,
        url: d.url || null,
        faviconUrl,
        amount: d.amount,
        currencyId: d.currencyId,
        billingCycle: d.billingCycle,
        billingEvery: d.billingEvery,
        billingUnitDays: d.billingUnitDays ?? null,
        startDate: start,
        nextPaymentDate: next,
        endDate: d.endDate ? new Date(d.endDate) : null,
        notes: d.notes || null,
        groups: d.groupIds?.length
          ? { create: d.groupIds.map((groupId) => ({ groupId })) }
          : undefined,
      },
    }),
  ]);

  await audit("SUBSCRIPTION_UPDATE", { entity: id });
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  return { ok: true, id };
}

export async function deleteSubscription(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  await prisma.subscription.delete({ where: { id } }).catch(() => null);
  await audit("SUBSCRIPTION_DELETE", { entity: id });
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  return { ok: true };
}

/** Advance the schedule after a payment has been registered / occurred. */
export async function advanceSubscription(id: string): Promise<void> {
  const user = await requireUser();
  const sub = await prisma.subscription.findUnique({ where: { id }, include: { currency: true } });
  if (!sub) return;
  const cfg = {
    cycle: sub.billingCycle as BillingCycle,
    every: sub.billingEvery,
    unitDays: sub.billingUnitDays,
  };
  const next = addPeriod(sub.nextPaymentDate, cfg);
  await prisma.subscription.update({ where: { id }, data: { nextPaymentDate: next } });
  if (user.telegramNotifyPaid) {
    void notifyMarkedPaid({
      title: sub.title,
      amount: Number(sub.amount),
      currencyCode: sub.currency.code,
      nextPaymentDate: next,
    });
  }
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
}