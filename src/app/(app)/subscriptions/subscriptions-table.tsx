"use client";

import { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Search, Pencil, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { deleteSubscription, advanceSubscription } from "./actions";
import { SubscriptionFormDialog } from "./subscription-form";

type GroupOpt = { id: string; name: string; color: string };
type CurrencyOpt = { id: string; code: string; symbol: string };

const CYCLE_LABEL: Record<string, string> = {
  MONTHLY: "Ежемесячно",
  QUARTERLY: "Ежеквартально",
  YEARLY: "Ежегодно",
  CUSTOM: "Другой",
};

interface Row {
  id: string;
  title: string;
  url?: string | null;
  faviconUrl?: string | null;
  amount: number;
  currencyId: string;
  currencyCode: string;
  currencySymbol: string;
  billingCycle: string;
  billingEvery: number;
  billingUnitDays?: number | null;
  startDate: string;
  endDate?: string | null;
  nextPaymentDate: string;
  active: boolean;
  notes?: string | null;
  groups: string[];
  groupIds: string[];
}

export function SubscriptionsTable({
  subscriptions,
  groups,
  currencies,
}: {
  subscriptions: Row[];
  groups: GroupOpt[];
  currencies: CurrencyOpt[];
}) {
  const [q, setQ] = useState("");
  const [_, startTransition] = useTransition();

  const filtered = subscriptions.filter((s) =>
    [s.title, s.groups.join(" "), s.currencyCode].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Mobile: карточки */}
      <div className="space-y-3 md:hidden">
        {filtered.length === 0 && (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Нет подписок</p>
        )}
        {filtered.map((s) => {
          const status = getStatus(s.nextPaymentDate, s.active);
          return (
            <div
              key={s.id}
              className={`rounded-xl border bg-card p-4 shadow-sm ${!s.active ? "opacity-50" : ""} ${
                status.tone === "danger" ? "border-destructive/30 bg-destructive/5" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {s.faviconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.faviconUrl} alt="" className="h-6 w-6 rounded" />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
                      {s.title.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {CYCLE_LABEL[s.billingCycle] ?? s.billingCycle}
                      {s.billingEvery > 1 && ` ×${s.billingEvery}`}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {s.amount.toLocaleString("ru-RU")} {s.currencySymbol}
                </p>
              </div>
              {s.groups.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.groups.map((g) => (
                    <Badge key={g} variant="secondary">{g}</Badge>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{formatDate(s.nextPaymentDate)}</span>
                  <StatusBadge tone={status.tone} label={status.label} />
                </div>
                <div className="flex items-center gap-1">
                  <SubscriptionFormDialog
                    groups={groups}
                    currencies={currencies}
                    editing={{
                      id: s.id,
                      title: s.title,
                      url: s.url,
                      amount: s.amount,
                      currencyId: s.currencyId,
                      billingCycle: s.billingCycle,
                      billingEvery: s.billingEvery,
                      billingUnitDays: s.billingUnitDays,
                      startDate: s.startDate,
                      endDate: s.endDate,
                      notes: s.notes,
                      groupIds: s.groupIds,
                    }}
                    trigger={
                      <Button variant="ghost" size="icon" title="Редактировать">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400"
                    onClick={() => {
                      startTransition(async () => {
                        await advanceSubscription(s.id);
                        toast.success(`«${s.title}» — оплачено, дата сдвинута`);
                      });
                    }}
                    title="Отметить оплаченной"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <DeleteButton id={s.id} title={s.title} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: таблица */}
      <div className="hidden rounded-xl border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Сервис</TableHead>
              <TableHead>Группы</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Период</TableHead>
              <TableHead>След. списание</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Нет подписок
                </TableCell>
              </TableRow>
            )}
            {filtered.map((s) => {
              const status = getStatus(s.nextPaymentDate, s.active);
              return (
              <TableRow
                key={s.id}
                className={
                  !s.active
                    ? "opacity-50"
                    : status.tone === "danger"
                      ? "bg-destructive/5 hover:bg-destructive/10"
                      : undefined
                }
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    {s.faviconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.faviconUrl} alt="" className="h-4 w-4 rounded" />
                    ) : null}
                    <div className="flex flex-col">
                      <span className="font-medium">{s.title}</span>
                      {s.url && (
                        <a
                          href={s.url.startsWith("http") ? s.url : `https://${s.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          {s.url}
                        </a>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {s.groups.map((g) => (
                      <Badge key={g} variant="secondary">{g}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.amount.toLocaleString("ru-RU")} {s.currencySymbol}
                </TableCell>
                <TableCell className="text-sm">
                  {CYCLE_LABEL[s.billingCycle] ?? s.billingCycle}
                  {s.billingEvery > 1 && ` ×${s.billingEvery}`}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm">{formatDate(s.nextPaymentDate)}</span>
                    <StatusBadge tone={status.tone} label={status.label} />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <SubscriptionFormDialog
                      groups={groups}
                      currencies={currencies}
                      editing={{
                        id: s.id,
                        title: s.title,
                        url: s.url,
                        amount: s.amount,
                        currencyId: s.currencyId,
                        billingCycle: s.billingCycle,
                        billingEvery: s.billingEvery,
                        billingUnitDays: s.billingUnitDays,
                        startDate: s.startDate,
                        endDate: s.endDate,
                        notes: s.notes,
                        groupIds: s.groupIds,
                      }}
                      trigger={
                        <Button variant="ghost" size="icon" title="Редактировать">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400"
                      onClick={() => {
                        startTransition(async () => {
                          await advanceSubscription(s.id);
                          toast.success(`«${s.title}» — оплачено, дата сдвинута`);
                        });
                      }}
                      title="Отметить оплаченной"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <DeleteButton id={s.id} title={s.title} />
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function getStatus(nextIso: string, active: boolean): { tone: "muted" | "danger" | "warn" | "soon" | "ok"; label: string } {
  if (!active) return { tone: "muted", label: "неактивна" };
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const next = new Date(nextIso).getTime();
  const days = Math.ceil((next - start) / 86_400_000);
  if (days < 0) return { tone: "danger", label: `просрочено ${-days} дн.` };
  if (days === 0) return { tone: "warn", label: "сегодня" };
  if (days === 1) return { tone: "warn", label: "завтра" };
  if (days <= 7) return { tone: "soon", label: `через ${days} дн.` };
  return { tone: "ok", label: `через ${days} дн.` };
}

function StatusBadge({ tone, label }: { tone: string; label: string }) {
  const cls =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : tone === "soon"
          ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
          : tone === "muted"
            ? "bg-muted text-muted-foreground"
            : "border-border bg-muted/50 text-muted-foreground";
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function DeleteButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      title="Удалить"
      onClick={() => {
        if (!confirm(`Удалить «${title}»?`)) return;
        start(async () => {
          await deleteSubscription(id);
          toast.success("Удалено");
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}