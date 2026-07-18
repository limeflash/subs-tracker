"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/utils";

export interface ForecastPoint {
  label: string;
  total: number;
}

export interface GroupSlice {
  name: string;
  value: number;
  color: string;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function ForecastChart({ data, currency }: { data: ForecastPoint[]; currency: string }) {
  const hasData = data.some((d) => d.total > 0);
  if (!hasData) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        В ближайшие 30 дней списаний нет
      </div>
    );
  }
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-lg border bg-popover px-3 py-1.5 text-sm shadow-md">
                  <span className="font-medium">{payload[0].payload.label}</span>
                  <span className="ml-2 tabular-nums text-muted-foreground">
                    {formatMoney(Number(payload[0].value), currency)}
                  </span>
                </div>
              ) : null
            }
          />
          <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupDonut({ data, currency }: { data: GroupSlice[]; currency: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        Нет активных подписок
      </div>
    );
  }
  const total = data.reduce((a, s) => a + s.value, 0);
  return (
    <div className="flex h-auto flex-col items-center gap-2 sm:h-56 sm:flex-row sm:gap-4">
      <div className="relative h-52 w-full sm:h-full sm:flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((s, i) => (
                <Cell key={s.name} fill={s.color || CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border bg-popover px-3 py-1.5 text-sm shadow-md">
                    <span className="font-medium">{payload[0].name}</span>
                    <span className="ml-2 tabular-nums text-muted-foreground">
                      {formatMoney(Number(payload[0].value), currency)}
                    </span>
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">в месяц</span>
          <span className="text-lg font-bold tabular-nums">{formatMoney(total, currency)}</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 sm:w-40 sm:block sm:space-y-1.5">
        {data.slice(0, 6).map((s, i) => (
          <li key={s.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: s.color || CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="truncate text-muted-foreground">{s.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
