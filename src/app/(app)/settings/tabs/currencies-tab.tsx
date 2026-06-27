"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";
import { updateCurrencyOverride, refreshRates, type SettingsState } from "../actions";

interface Snapshot { rate: number; date: string }
interface Currency {
  id: string;
  code: string;
  symbol: string;
  isBase: boolean;
  overrideRateToBase: number | null;
  snapshot: Snapshot | null;
}

function fmtRate(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 4, minimumFractionDigits: 4 });
}

export function CurrenciesTab(props: { baseCode: string; currencies: Currency[] }) {
  const [state, formAction] = useActionState(updateCurrencyOverride, undefined);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state?.ok) toast.success("Курс обновлён");
    else if (state?.error) toast.error(state.error);
  }, [state]);

  const refresh = () => {
    startTransition(async () => {
      const res = await refreshRates();
      if (res.ok) toast.success(`Курсы обновлены (${res.ratesSaved ?? 0} пар)`);
      else toast.error(res.error ?? "Не удалось обновить курсы");
    });
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>Валюты и курсы</CardTitle>
          <CardDescription>
            Базовая валюта: {props.baseCode}. Актуальный курс тянется с open.er-api.com (франкфурт — запасной). Cron обновляет ежедневно; можно обновить вручную.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={pending}>
          <RotateCw className={pending ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          Обновить сейчас
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.currencies.map((c) => (
          <div key={c.id} className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.code}</span>
                <span className="text-xs text-muted-foreground">{c.symbol}</span>
                {c.isBase && <Badge>базовая</Badge>}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {c.isBase ? (
                  "—"
                ) : c.snapshot ? (
                  <span>
                    курс: <span className="font-medium text-foreground">{fmtRate(c.snapshot.rate)}</span>
                    {" "}{props.baseCode}
                    <span className="ml-2">от {new Date(c.snapshot.date).toLocaleDateString("ru-RU")}</span>
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-500">нет данных</span>
                )}
              </div>
            </div>
            {!c.isBase && (
              <form action={formAction} className="mt-3 flex items-end gap-3">
                <input type="hidden" name="currencyId" value={c.id} />
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`ov-${c.id}`} className="text-xs">
                    Переопределить курс к {props.baseCode} (1 {c.code} = ?)
                  </Label>
                  <Input
                    id={`ov-${c.id}`}
                    name="overrideRateToBase"
                    type="number"
                    step="0.0001"
                    min={0}
                    defaultValue={c.overrideRateToBase ?? ""}
                    placeholder="авто (по снапшоту)"
                  />
                </div>
                <Button type="submit" size="sm">OK</Button>
              </form>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}