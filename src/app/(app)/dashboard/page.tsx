export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { monthRange } from "@/lib/stats";
import { convertAmount, monthlyEquivalent } from "@/lib/exchange";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default async function DashboardPage() {
  const user = await requireUser();
  const displayCode = user.displayCurrency?.code ?? "USD";
  const month = monthRange();

  const [allActive, payroll, upcoming, activeCount] = await Promise.all([
    prisma.subscription.findMany({ where: { active: true }, include: { currency: true } }),
    prisma.salaryPayment.findMany({
      where: { paidAt: { gte: month.start, lt: month.end } },
      include: { currency: true },
    }),
    prisma.subscription.findMany({
      where: { active: true, nextPaymentDate: { gte: new Date() } },
      orderBy: { nextPaymentDate: "asc" },
      take: 5,
      include: { currency: true },
    }),
    prisma.subscription.count({ where: { active: true } }),
  ]);

  // "Расход за месяц" = monthly-equivalent of every active subscription,
  // converted into the display currency. This is the real monthly load and
  // is never 0 merely because no payment happens to fall in this calendar
  // month. null (a missing rate) is surfaced as "?".
  const subConv = await Promise.all(
    allActive.map((s) =>
      convertAmount(
        monthlyEquivalent(
          Number(s.amount),
          s.billingCycle,
          s.billingEvery,
          s.billingUnitDays,
        ),
        s.currency.code,
        displayCode,
      ),
    ),
  );
  const payConv = await Promise.all(
    payroll.map((p) => convertAmount(Number(p.amount), p.currency.code, displayCode)),
  );
  const subsTotal = subConv.reduce<number | null>(
    (acc, v) => (v == null ? null : acc == null ? null : acc + v),
    0,
  );
  const payrollTotal = payConv.reduce<number | null>(
    (acc, v) => (v == null ? null : acc == null ? null : acc + v),
    0,
  );
  const fmtTotal = (t: number | null) => (t == null ? "?" : formatMoney(t, displayCode));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Главная</h1>
        <p className="text-sm text-muted-foreground">{month.label} · валюта: {displayCode}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Активных подписок" value={String(activeCount)} />
        <StatCard title="Расход за месяц" value={fmtTotal(subsTotal)} hint={`${allActive.length} подписок · ${displayCode}`} />
        <StatCard title="ЗП за месяц" value={fmtTotal(payrollTotal)} hint={`${payroll.length} выплат · ${displayCode}`} />
        <StatCard title="Ближайшее списание" value={upcoming[0]?.title ?? "—"} hint={upcoming[0] ? formatDate(upcoming[0].nextPaymentDate) : "нет"} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Ближайшие списания</CardTitle>
          <Link href="/subscriptions" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            Все <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Нет предстоящих списаний.</p>}
          {upcoming.map((s) => (
            <div key={s.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
              <div className="flex items-center gap-2">
                {s.faviconUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.faviconUrl} alt="" className="h-4 w-4 rounded" />
                )}
                <span className="font-medium">{s.title}</span>
              </div>
              <div className="text-sm">
                <span className="tabular-nums">{formatMoney(Number(s.amount), s.currency.code)}</span>
                <span className="ml-3 text-muted-foreground">{formatDate(s.nextPaymentDate)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}