"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveFavicon } from "@/lib/favicon";
import { nextPaymentFrom, type BillingCycle } from "@/lib/periods";
import { notifyMarkedPaid } from "@/lib/notify";
import { markSubscriptionPaid } from "@/lib/subscriptions";
import { parseSubscriptionsFromImage, resolveCurrencyId, buildAiContext } from "@/lib/ai";
import { applyParsedAction } from "@/lib/subscriptions";
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

export interface ParsedItem {
  action?: "add" | "update" | "mark_paid";
  matchTitle?: string | null;
  group?: string | null;
  groupId?: string | null; // resolved existing group (web prefill)
  title: string;
  amount: number;
  currency: string;
  currencyId: string | null;
  cycle: "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
  every: number;
  unitDays?: number | null;
  url?: string | null;
  nextPaymentDate?: string | null;
  notes?: string | null;
}

/** AI import: parse a base64 screenshot into subscription drafts. */
export async function parseScreenshot(
  imageBase64: string,
): Promise<{ ok: boolean; items?: ParsedItem[]; error?: string }> {
  await requireUser();
  if (!imageBase64 || imageBase64.length > 10_000_000) {
    return { ok: false, error: "Файл слишком большой (макс ~7 МБ)" };
  }
  try {
    const ctx = await buildAiContext();
    const parsed = await parseSubscriptionsFromImage(imageBase64, undefined, ctx);
    if (parsed.length === 0) return { ok: false, error: "Подписки на изображении не найдены" };
    const groups = await prisma.group.findMany();
    const items: ParsedItem[] = [];
    for (const p of parsed.slice(0, 10)) {
      const g = p.group
        ? groups.find((x) => x.name.toLowerCase() === p.group!.toLowerCase())
        : null;
      items.push({ ...p, currencyId: await resolveCurrencyId(p.currency), groupId: g?.id ?? null });
    }
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Apply one AI draft directly (add / update / mark_paid). */
export async function applyParsedItem(item: ParsedItem): Promise<{ ok: boolean; message?: string; error?: string }> {
  await requireUser();
  const res = await applyParsedAction(item);
  if ("error" in res) return { ok: false, error: res.error };
  const verb = res.kind === "added" ? "добавлена" : res.kind === "updated" ? "обновлена" : "закрыта (оплачено)";
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  return { ok: true, message: `«${res.title}» ${verb}` };
}

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
  const res = await markSubscriptionPaid(id);
  if (!res) return;
  if (user.telegramNotifyPaid) {
    void notifyMarkedPaid(res);
  }
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
}