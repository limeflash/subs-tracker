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
import { formatMoney } from "@/lib/utils";

const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7", "#14b8a6", "#f97316"];

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
          <Button variant="outline" size="sm" onClick={() => exportData("csv")}>CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportData("json")}>JSON</Button>
        </div>
      </div>

      {hasUnknown && (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          ⚠ Некоторые суммы не удалось конвертировать в {props.displayCode} — обновите курсы валют в Настройках.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Расходы: подписки vs ЗП</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={compareData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: number) => formatMoney(v, props.displayCode)} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Подписки по группам</CardTitle></CardHeader>
          <CardContent>
            {props.byGroup.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет данных</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={props.byGroup} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {props.byGroup.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v, props.displayCode)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Итог подписок</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{props.subTotal == null ? "—" : formatMoney(props.subTotal, props.displayCode)}</p>
            <p className="text-sm text-muted-foreground">{props.subRows.length} списаний</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Итог ЗП</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{props.payTotal == null ? "—" : formatMoney(props.payTotal, props.displayCode)}</p>
            <p className="text-sm text-muted-foreground">{props.payRows.length} выплат</p>
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