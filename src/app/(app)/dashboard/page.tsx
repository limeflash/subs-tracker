export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { monthRange } from "@/lib/stats";
import { convertAmount, monthlyEquivalent } from "@/lib/exchange";
import { addPeriod, nextPaymentFrom, type BillingConfig } from "@/lib/periods";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight, CalendarClock, CreditCard, Users, Wallet, TrendingUp, PieChart as PieIcon } from "lucide-react";
import { ForecastChart, GroupDonut, type ForecastPoint, type GroupSlice } from "./dashboard-charts";
import { OverdueList, type OverdueRow } from "./overdue-list";

const DAY_MS = 86_400_000;

export default async function DashboardPage() {
  const user = await requireUser();
  const displayCode = user.displayCurrency?.code ?? "USD";
  const month = monthRange();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [allActive, payroll, activeCount, groups] = await Promise.all([
    prisma.subscription.findMany({
      where: { active: true },
      include: { currency: true, groups: { include: { group: true } } },
      orderBy: { nextPaymentDate: "asc" },
    }),
    prisma.salaryPayment.findMany({
      where: { paidAt: { gte: month.start, lt: month.end } },
      include: { currency: true },
    }),
    prisma.subscription.count({ where: { active: true } }),
    prisma.group.findMany(),
  ]);

  // "Расход за месяц" = monthly-equivalent of every active subscription,
  // converted into the display currency.
  const subConv = await Promise.all(
    allActive.map((s) =>
      convertAmount(
        monthlyEquivalent(Number(s.amount), s.billingCycle, s.billingEvery, s.billingUnitDays),
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

  // ---- overdue ----
  const overdue: OverdueRow[] = allActive
    .filter((s) => s.nextPaymentDate.getTime() <= now.getTime())
    .map((s) => ({
      id: s.id,
      title: s.title,
      faviconUrl: s.faviconUrl,
      amount: Number(s.amount),
      currencyCode: s.currency.code,
      nextPaymentDate: s.nextPaymentDate.toISOString(),
      overdueDays: Math.max(0, Math.floor((startOfToday.getTime() - s.nextPaymentDate.getTime()) / DAY_MS)),
    }));

  // ---- upcoming (future only) ----
  const upcoming = allActive
    .filter((s) => s.nextPaymentDate.getTime() > now.getTime())
    .slice(0, 6)
    .map((s) => ({
      id: s.id,
      title: s.title,
      faviconUrl: s.faviconUrl,
      amount: Number(s.amount),
      currencyCode: s.currency.code,
      nextPaymentDate: s.nextPaymentDate,
      daysLeft: Math.ceil((s.nextPaymentDate.getTime() - startOfToday.getTime()) / DAY_MS),
    }));

  // ---- 30-day forecast, converted to display currency ----
  const buckets = new Map<number, number>();
  await Promise.all(
    allActive.map(async (s) => {
      const cfg: BillingConfig = {
        cycle: s.billingCycle as BillingConfig["cycle"],
        every: s.billingEvery,
        unitDays: s.billingUnitDays,
      };
      const converted = await convertAmount(Number(s.amount), s.currency.code, displayCode);
      if (converted == null) return;
      let d = s.nextPaymentDate.getTime() > now.getTime()
        ? new Date(s.nextPaymentDate)
        : nextPaymentFrom(s.nextPaymentDate, now, cfg);
      const horizon = startOfToday.getTime() + 30 * DAY_MS;
      for (let i = 0; i < 64 && d.getTime() < horizon; i++) {
        const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        buckets.set(key, (buckets.get(key) ?? 0) + converted);
        d = addPeriod(d, cfg);
      }
    }),
  );
  const forecast: ForecastPoint[] = Array.from({ length: 30 }, (_, i) => {
    const t = startOfToday.getTime() + i * DAY_MS;
    return {
      label: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(t)),
      total: Math.round((buckets.get(t) ?? 0) * 100) / 100,
    };
  });

  // ---- split by group (monthly equivalent) ----
  const groupColors = new Map(groups.map((g) => [g.id, g.color]));
  const slices = new Map<string, GroupSlice>();
  allActive.forEach((s, i) => {
    const v = subConv[i];
    if (v == null) return;
    const g = s.groups[0]?.group;
    const name = g?.name ?? "Без группы";
    const cur = slices.get(name) ?? { name, value: 0, color: g ? (groupColors.get(g.id) ?? "") : "" };
    cur.value += v;
    slices.set(name, cur);
  });
  const groupData = [...slices.values()]
    .map((s) => ({ ...s, value: Math.round(s.value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <h1 className="text-2xl font-bold tracking-tight">Главная</h1>
        <p className="text-sm text-muted-foreground">{month.label} · валюта: {displayCode}</p>
      </div>

      <div className="grid animate-rise gap-4 sm:grid-cols-2 lg:grid-cols-4" style={{ animationDelay: "60ms" }}>
        <StatCard
          title="Активных подписок"
          value={String(activeCount)}
          hint={overdue.length > 0 ? `${overdue.length} просрочено` : "все в порядке"}
          hintTone={overdue.length > 0 ? "danger" : "ok"}
          icon={<CreditCard className="h-5 w-5 text-white" strokeWidth={2.2} />}
          chipClass="from-indigo-500 to-violet-600 shadow-indigo-500/25"
        />
        <StatCard
          title="Расход за месяц"
          value={fmtTotal(subsTotal)}
          hint={`${allActive.length} подписок · ${displayCode}`}
          icon={<Wallet className="h-5 w-5 text-white" strokeWidth={2.2} />}
          chipClass="from-emerald-500 to-teal-600 shadow-emerald-500/25"
        />
        <StatCard
          title="ЗП за месяц"
          value={fmtTotal(payrollTotal)}
          hint={`${payroll.length} выплат · ${displayCode}`}
          icon={<Users className="h-5 w-5 text-white" strokeWidth={2.2} />}
          chipClass="from-amber-500 to-orange-600 shadow-amber-500/25"
        />
        <StatCard
          title="Ближайшее списание"
          value={upcoming[0]?.title ?? "—"}
          hint={upcoming[0] ? `${formatDate(upcoming[0].nextPaymentDate)} · ${daysLabel(upcoming[0].daysLeft)}` : "нет"}
          icon={<CalendarClock className="h-5 w-5 text-white" strokeWidth={2.2} />}
          chipClass="from-sky-500 to-blue-600 shadow-sky-500/25"
        />
      </div>

      <OverdueList rows={overdue} />

      <div className="grid animate-rise gap-4 lg:grid-cols-5" style={{ animationDelay: "120ms" }}>
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <TrendingUp className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Списания на 30 дней вперёд</CardTitle>
          </CardHeader>
          <CardContent>
            <ForecastChart data={forecast} currency={displayCode} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <PieIcon className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Структура расходов</CardTitle>
          </CardHeader>
          <CardContent>
            <GroupDonut data={groupData} currency={displayCode} />
          </CardContent>
        </Card>
      </div>

      <Card className="animate-rise" style={{ animationDelay: "180ms" }}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Ближайшие списания</CardTitle>
          <Link href="/subscriptions" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            Все <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-1">
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Нет предстоящих списаний.</p>}
          {upcoming.map((s) => (
            <div
              key={s.id}
              className="-mx-2 flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-accent/50"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {s.faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.faviconUrl} alt="" className="h-5 w-5 rounded" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                    {s.title.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="truncate font-medium">{s.title}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <span className="font-semibold tabular-nums">{formatMoney(s.amount, s.currencyCode)}</span>
                <Badge
                  variant={s.daysLeft <= 1 ? "default" : "secondary"}
                  className="w-24 justify-center tabular-nums"
                >
                  {daysLabel(s.daysLeft)}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  hintTone,
  icon,
  chipClass,
}: {
  title: string;
  value: string;
  hint?: string;
  hintTone?: "ok" | "danger";
  icon: React.ReactNode;
  chipClass: string;
}) {
  return (
    <Card className="hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="truncate text-2xl font-bold tracking-tight">{value}</p>
          {hint && (
            <p
              className={
                hintTone === "danger"
                  ? "text-xs font-medium text-destructive"
                  : hintTone === "ok"
                    ? "text-xs text-emerald-600 dark:text-emerald-400"
                    : "text-xs text-muted-foreground"
              }
            >
              {hint}
            </p>
          )}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md ${chipClass}`}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function daysLabel(days: number): string {
  if (days <= 0) return "сегодня";
  if (days === 1) return "завтра";
  const m10 = days % 10;
  const m100 = days % 100;
  const word = m10 === 1 && m100 !== 11 ? "день" : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? "дня" : "дней";
  return `через ${days} ${word}`;
}
