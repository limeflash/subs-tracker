"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CreditCard, Users, Download } from "lucide-react";
import { formatMoney } from "@/lib/utils";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#a855f7",
  "#14b8a6",
  "#f97316",
];

interface Props {
  period: string;
  rangeLabel: string;
  displayCode: string;
  subTotal: number | null;
  payTotal: number | null;
  subRows: { id: string; title: string; amount: number; currencyCode: string; converted: number | null; groupNames: string[] }[];
  payRows: { id: string; employee: string; amount: number; currencyCode: string; converted: number | null; periodLabel: string }[];
  byGroup: { name: string; value: number }[];
  refIso: string;
}

export function StatsView(props: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function update(period: string, ref: string) {
    const params = new URLSearchParams();
    params.set("period", period);
    params.set("ref", ref);
    router.push(`/statistics?${params.toString()}`);
  }

  const compareData = [
    { name: "Подписки", value: props.subTotal ?? 0 },
    { name: "ЗП", value: props.payTotal ?? 0 },
  ];
  const hasUnknown = props.subTotal == null || props.payTotal == null;

  function exportData(format: "csv" | "json") {
    const payload = {
      period: props.period,
      range: props.rangeLabel,
      displayCurrency: props.displayCode,
      subscriptions: props.subRows,
      payroll: props.payRows,
      totals: { subscriptions: props.subTotal, payroll: props.payTotal },
      byGroup: props.byGroup,
    };
    if (format === "json") {
      download(JSON.stringify(payload, null, 2), "statistics.json", "application/json");
    } else {
      const lines = ["section,name,amount,currency,converted,to_" + props.displayCode];
      for (const r of props.subRows) lines.push(`subscription,"${r.title}",${r.amount},${r.currencyCode},${r.converted ?? ""},${props.displayCode}`);
      for (const r of props.payRows) lines.push(`payroll,"${r.employee} (${r.periodLabel})",${r.amount},${r.currencyCode},${r.converted ?? ""},${props.displayCode}`);
      download(lines.join("\n"), "statistics.csv", "text/csv");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Период</label>
          <Select value={props.period} onValueChange={(v) => update(v, sp.get("ref") ?? new Date(props.refIso).toISOString().slice(0, 10))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Месяц</SelectItem>
              <SelectItem value="quarter">Квартал</SelectItem>
              <SelectItem value="year">Год</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Опорная дата</label>
          <Input
            type="date"
            defaultValue={new Date(props.refIso).toISOString().slice(0, 10)}
            onChange={(e) => update(props.period, e.target.value)}
            className="w-44"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportData("csv")}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportData("json")}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> JSON
          </Button>
        </div>
      </div>

      {hasUnknown && (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          ⚠ Некоторые суммы не удалось конвертировать в {props.displayCode} — обновите курсы валют в Настройках.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Расходы: подписки vs ЗП</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={compareData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis hide domain={[0, "dataMax"]} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-1.5 text-sm shadow-md">
                        <span className="font-medium">{payload[0].payload.name}</span>
                        <span className="ml-2 tabular-nums text-muted-foreground">
                          {formatMoney(Number(payload[0].value), props.displayCode)}
                        </span>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={72}>
                  {compareData.map((d, i) => (
                    <Cell key={d.name} fill={PIE_COLORS[i === 0 ? 0 : 2]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Подписки по группам</CardTitle></CardHeader>
          <CardContent>
            {props.byGroup.length === 0 ? (
              <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">Нет данных</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={props.byGroup}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {props.byGroup.map((g, i) => <Cell key={g.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border bg-popover px-3 py-1.5 text-sm shadow-md">
                          <span className="font-medium">{payload[0].name}</span>
                          <span className="ml-2 tabular-nums text-muted-foreground">
                            {formatMoney(Number(payload[0].value), props.displayCode)}
                          </span>
                        </div>
                      ) : null
                    }
                  />
                  <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/25">
              <CreditCard className="h-5 w-5 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Итог подписок</p>
              <p className="text-2xl font-bold tabular-nums tracking-tight">
                {props.subTotal == null ? "—" : formatMoney(props.subTotal, props.displayCode)}
              </p>
              <p className="text-xs text-muted-foreground">{props.subRows.length} списаний</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md shadow-amber-500/25">
              <Users className="h-5 w-5 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Итог ЗП</p>
              <p className="text-2xl font-bold tabular-nums tracking-tight">
                {props.payTotal == null ? "—" : formatMoney(props.payTotal, props.displayCode)}
              </p>
              <p className="text-xs text-muted-foreground">{props.payRows.length} выплат</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}