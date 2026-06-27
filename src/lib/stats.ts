import { prisma } from "@/lib/db";
import { convertAmount } from "@/lib/exchange";

export interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
}

export function monthRange(ref = new Date()): PeriodRange {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  return { start, end, label: start.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }) };
}

export function quarterRange(ref = new Date()): PeriodRange {
  const q = Math.floor(ref.getMonth() / 3);
  const start = new Date(ref.getFullYear(), q * 3, 1);
  const end = new Date(ref.getFullYear(), q * 3 + 3, 1);
  return { start, end, label: `Q${q + 1} ${ref.getFullYear()}` };
}

export function yearRange(ref = new Date()): PeriodRange {
  const start = new Date(ref.getFullYear(), 0, 1);
  const end = new Date(ref.getFullYear() + 1, 0, 1);
  return { start, end, label: `${ref.getFullYear()}` };
}

export function periodFor(kind: "month" | "quarter" | "year", ref?: Date): PeriodRange {
  if (kind === "month") return monthRange(ref);
  if (kind === "quarter") return quarterRange(ref);
  return yearRange(ref);
}

/** Convert a value to the user's display currency, tolerant of missing rates. */
async function toDisplay(amount: number, fromCode: string, displayCode: string): Promise<number | null> {
  return convertAmount(amount, fromCode, displayCode);
}

/** Sum subscription costs whose nextPaymentDate falls within range, in display currency. */
export async function subscriptionsTotal(
  displayCode: string,
  range: PeriodRange,
): Promise<{ total: number | null; items: { id: string; title: string; amount: number; currencyCode: string; next: Date; converted: number | null }[] }> {
  const subs = await prisma.subscription.findMany({
    where: { active: true, nextPaymentDate: { gte: range.start, lt: range.end } },
    include: { currency: true },
  });
  let total: number | null = 0;
  const items = [];
  for (const s of subs) {
    const converted = await toDisplay(Number(s.amount), s.currency.code, displayCode);
    if (converted != null) total = (total ?? 0) + converted;
    else total = null;
    items.push({ id: s.id, title: s.title, amount: Number(s.amount), currencyCode: s.currency.code, next: s.nextPaymentDate, converted });
  }
  return { total, items };
}

export async function payrollTotal(
  displayCode: string,
  range: PeriodRange,
): Promise<{ total: number | null; items: { employeeName: string; amount: number; currencyCode: string; converted: number | null }[] }> {
  const payments = await prisma.salaryPayment.findMany({
    where: { paidAt: { gte: range.start, lt: range.end } },
    include: { currency: true, employee: true },
  });
  let total: number | null = 0;
  const items = [];
  for (const p of payments) {
    const converted = await toDisplay(Number(p.amount), p.currency.code, displayCode);
    if (converted != null) total = (total ?? 0) + converted;
    else total = null;
    items.push({ employeeName: p.employee.name, amount: Number(p.amount), currencyCode: p.currency.code, converted });
  }
  return { total, items };
}