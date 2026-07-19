"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/utils";
import { ClickMoney } from "@/components/click-money";
import { advanceSubscription } from "../subscriptions/actions";

export interface OverdueRow {
  id: string;
  title: string;
  faviconUrl?: string | null;
  amount: number;
  currencyCode: string;
  convertedAmount?: number | null;
  displayCode?: string;
  nextPaymentDate: string;
  overdueDays: number;
}

export function OverdueList({ rows }: { rows: OverdueRow[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" />
        Просроченные списания — {rows.length}
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg bg-card px-3 py-2 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {r.faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.faviconUrl} alt="" className="h-5 w-5 rounded" />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(r.nextPaymentDate)} · просрочено на {r.overdueDays}{" "}
                    {plural(r.overdueDays)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold">
                  <ClickMoney
                    converted={r.convertedAmount != null ? formatMoney(r.convertedAmount, r.displayCode ?? "USD") : null}
                    native={formatMoney(r.amount, r.currencyCode)}
                  />
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  className="hidden border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive sm:inline-flex"
                  onClick={() =>
                    start(async () => {
                      await advanceSubscription(r.id);
                      toast.success(`«${r.title}» — оплачено, дата сдвинута`);
                    })
                  }
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Оплачено
                </Button>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              className="mt-2 w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive sm:hidden"
              onClick={() =>
                start(async () => {
                  await advanceSubscription(r.id);
                  toast.success(`«${r.title}» — оплачено, дата сдвинута`);
                })
              }
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Оплачено
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function plural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "дня";
  return "дней";
}
