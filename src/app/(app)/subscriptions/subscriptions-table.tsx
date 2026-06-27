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
import { Trash2, Search, Pencil } from "lucide-react";
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
      <div className="rounded-md border">
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
            {filtered.map((s) => (
              <TableRow key={s.id} className={!s.active ? "opacity-50" : undefined}>
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
                <TableCell className="text-sm">{formatDate(s.nextPaymentDate)}</TableCell>
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
                      size="sm"
                      onClick={() => {
                        startTransition(async () => {
                          await advanceSubscription(s.id);
                          toast.success("Списание отмечено, расписание сдвинуто");
                        });
                      }}
                      title="Отметить списание (сдвинуть next)"
                    >
                      ✓
                    </Button>
                    <DeleteButton id={s.id} title={s.title} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
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