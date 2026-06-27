"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";

const GroupSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).or(z.literal("")),
  icon: z.string().max(60).optional(),
});

export type GroupState = { ok: boolean; error?: string };

export async function createGroup(_prev: GroupState | undefined, formData: FormData): Promise<GroupState> {
  await requireUser();
  const parsed = GroupSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "#64748b",
    icon: formData.get("icon") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Неверные данные" };
  const g = await prisma.group.create({
    data: { name: parsed.data.name, color: parsed.data.color || "#64748b", icon: parsed.data.icon || null },
  });
  await audit("GROUP_CREATE", { entity: g.id });
  revalidatePath("/groups");
  revalidatePath("/subscriptions");
  return { ok: true };
}

export async function updateGroup(id: string, formData: FormData): Promise<GroupState> {
  await requireUser();
  const parsed = GroupSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "#64748b",
    icon: formData.get("icon") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Неверные данные" };
  await prisma.group.update({
    where: { id },
    data: { name: parsed.data.name, color: parsed.data.color || "#64748b", icon: parsed.data.icon || null },
  });
  await audit("GROUP_UPDATE", { entity: id });
  revalidatePath("/groups");
  revalidatePath("/subscriptions");
  return { ok: true };
}

export async function deleteGroup(id: string): Promise<GroupState> {
  await requireUser();
  await prisma.group.delete({ where: { id } }).catch(() => null);
  await audit("GROUP_DELETE", { entity: id });
  revalidatePath("/groups");
  revalidatePath("/subscriptions");
  return { ok: true };
}