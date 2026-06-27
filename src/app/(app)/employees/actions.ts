"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";

const EmployeeSchema = z.object({
  name: z.string().min(1).max(200),
  position: z.string().max(200).optional(),
  contact: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export type EmployeeState = { ok: boolean; error?: string };

export async function createEmployee(_prev: EmployeeState | undefined, formData: FormData): Promise<EmployeeState> {
  await requireUser();
  const parsed = EmployeeSchema.safeParse({
    name: formData.get("name"),
    position: formData.get("position") || undefined,
    contact: formData.get("contact") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Неверные данные" };
  const emp = await prisma.employee.create({ data: { name: parsed.data.name, position: parsed.data.position || null, contact: parsed.data.contact || null, notes: parsed.data.notes || null } });
  await audit("EMPLOYEE_CREATE", { entity: emp.id, meta: { name: emp.name } });
  revalidatePath("/employees");
  return { ok: true };
}

export async function updateEmployee(id: string, formData: FormData): Promise<EmployeeState> {
  await requireUser();
  const parsed = EmployeeSchema.safeParse({
    name: formData.get("name"),
    position: formData.get("position") || undefined,
    contact: formData.get("contact") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Неверные данные" };
  await prisma.employee.update({
    where: { id },
    data: { name: parsed.data.name, position: parsed.data.position || null, contact: parsed.data.contact || null, notes: parsed.data.notes || null },
  });
  await audit("EMPLOYEE_UPDATE", { entity: id });
  revalidatePath("/employees");
  return { ok: true };
}

export async function deleteEmployee(id: string): Promise<EmployeeState> {
  await requireUser();
  await prisma.employee.delete({ where: { id } }).catch(() => null);
  await audit("EMPLOYEE_DELETE", { entity: id });
  revalidatePath("/employees");
  revalidatePath("/salaries");
  return { ok: true };
}

const SalarySchema = z.object({
  employeeId: z.string().min(1),
  amount: z.coerce.number().positive().max(1_000_000_000),
  currencyId: z.string().min(1),
  paidAt: z.string().min(1),
  periodLabel: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
});

export type SalaryState = { ok: boolean; error?: string };

export async function createSalary(_prev: SalaryState | undefined, formData: FormData): Promise<SalaryState> {
  await requireUser();
  const parsed = SalarySchema.safeParse({
    employeeId: formData.get("employeeId"),
    amount: formData.get("amount"),
    currencyId: formData.get("currencyId"),
    paidAt: formData.get("paidAt"),
    periodLabel: formData.get("periodLabel"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  const paidAt = new Date(parsed.data.paidAt);
  if (isNaN(paidAt.getTime())) return { ok: false, error: "Неверная дата" };
  const payment = await prisma.salaryPayment.create({
    data: {
      employeeId: parsed.data.employeeId,
      amount: parsed.data.amount,
      currencyId: parsed.data.currencyId,
      paidAt,
      periodLabel: parsed.data.periodLabel,
      notes: parsed.data.notes || null,
    },
  });
  await audit("PAYROLL_CREATE", { entity: payment.id, meta: { employeeId: parsed.data.employeeId } });
  revalidatePath("/salaries");
  revalidatePath("/employees");
  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  return { ok: true };
}

export async function deleteSalary(id: string): Promise<SalaryState> {
  await requireUser();
  await prisma.salaryPayment.delete({ where: { id } }).catch(() => null);
  await audit("PAYROLL_DELETE", { entity: id });
  revalidatePath("/salaries");
  revalidatePath("/employees");
  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  return { ok: true };
}