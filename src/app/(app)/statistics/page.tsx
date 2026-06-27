export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { periodFor, type PeriodRange } from "@/lib/stats";
import { convertAmount } from "@/lib/exchange";
import { StatsView } from "./stats-view";
import { redirect } from "next/navigation";

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; ref?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const kind = (sp.period === "quarter" || sp.period === "year") ? sp.period : "month";
  const ref = sp.ref ? new Date(sp.ref) : new Date();
  if (isNaN(ref.getTime())) redirect("/statistics");
  const range: PeriodRange = periodFor(kind as "month" | "quarter" | "year", ref);

  const [subs, payments, groups] = await Promise.all([
    prisma.subscription.findMany({
      where: { active: true, nextPaymentDate: { gte: range.start, lt: range.end } },
      include: { currency: true, groups: { include: { group: true } } },
    }),
    prisma.salaryPayment.findMany({
      where: { paidAt: { gte: range.start, lt: range.end } },
      include: { currency: true, employee: true },
    }),
    prisma.group.findMany(),
  ]);

  const displayCode = user.displayCurrency?.code ?? "USD";

  const subRows = await Promise.all(
    subs.map(async (s) => ({
      id: s.id,
      title: s.title,
      amount: Number(s.amount),
      currencyCode: s.currency.code,
      converted: await convertAmount(Number(s.amount), s.currency.code, displayCode),
      groupNames: s.groups.map((g) => g.group.name),
    })),
  );
  const payRows = await Promise.all(
    payments.map(async (p) => ({
      id: p.id,
      employee: p.employee.name,
      amount: Number(p.amount),
      currencyCode: p.currency.code,
      converted: await convertAmount(Number(p.amount), p.currency.code, displayCode),
      periodLabel: p.periodLabel,
    })),
  );

  const subTotal = subRows.reduce<number | null>((acc, r) => (r.converted == null ? null : (acc ?? 0) + r.converted), 0);
  const payTotal = payRows.reduce<number | null>((acc, r) => (r.converted == null ? null : (acc ?? 0) + r.converted), 0);

  // group breakdown
  const byGroup = new Map<string, number>();
  for (const r of subRows) {
    if (r.converted == null) continue;
    const key = r.groupNames[0] ?? "Без группы";
    byGroup.set(key, (byGroup.get(key) ?? 0) + r.converted);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Статистика</h1>
        <p className="text-sm text-muted-foreground">{range.label} · {displayCode}</p>
      </div>
      <StatsView
        period={kind}
        rangeLabel={range.label}
        displayCode={displayCode}
        subTotal={subTotal}
        payTotal={payTotal}
        subRows={subRows}
        payRows={payRows}
        byGroup={Array.from(byGroup.entries()).map(([name, value]) => ({ name, value }))}
        refIso={ref.toISOString()}
      />
    </div>
  );
}