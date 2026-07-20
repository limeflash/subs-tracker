"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { createSubscription, updateSubscription, type SubFormState } from "./actions";

interface Props {
  groups: { id: string; name: string; color: string }[];
  currencies: { id: string; code: string; symbol: string }[];
  defaultCurrencyId?: string;
  trigger?: React.ReactNode;
  /** Controlled mode (used by the AI import flow). */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  editing?: {
    id: string;
    title: string;
    url?: string | null;
    amount: number;
    currencyId: string;
    billingCycle: string;
    billingEvery: number;
    billingUnitDays?: number | null;
    startDate: string;
    endDate?: string | null;
    notes?: string | null;
    groupIds: string[];
  };
  /** AI-parsed draft used to prefill the create form. */
  prefill?: {
    title?: string;
    url?: string | null;
    amount?: number;
    currencyId?: string | null;
    billingCycle?: string;
    billingEvery?: number;
    billingUnitDays?: number | null;
    startDate?: string;
    notes?: string | null;
    groupIds?: string[];
  };
}

export function SubscriptionFormDialog(props: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.open ?? internalOpen;
  const setOpen = props.onOpenChange ?? setInternalOpen;
  const d = props.editing ?? props.prefill;
  const [favicon, setFavicon] = useState<string | null>(null);
  const [url, setUrl] = useState(d?.url ?? "");
  const [cycle, setCycle] = useState<string>(d?.billingCycle ?? "MONTHLY");
  const [groupIds, setGroupIds] = useState<string[]>(props.editing?.groupIds ?? props.prefill?.groupIds ?? []);

  // live favicon preview when URL changes
  useEffect(() => {
    if (!url) return setFavicon(null);
    const host = (() => {
      try {
        return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
      } catch {
        return url.split("/")[0];
      }
    })();
    if (host) setFavicon(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
  }, [url]);

  const action = (state: SubFormState | undefined, fd: FormData) => {
    // inject selected groups into formData as repeated keys
    fd.delete("groupIds");
    for (const gid of groupIds) fd.append("groupIds", gid);
    if (props.editing) {
      return updateSubscription(props.editing.id, fd);
    }
    return createSubscription(state, fd);
  };
  const [state, formAction] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.ok) {
      toast.success(props.editing ? "Подписка обновлена" : "Подписка добавлена");
      setOpen(false);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {props.trigger && <DialogTrigger asChild>{props.trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.editing ? "Редактировать подписку" : "Новая подписка"}</DialogTitle>
          <DialogDescription>
            Введите адрес сайта — значок подтянется автоматически.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Название</Label>
            <Input id="title" name="title" required defaultValue={d?.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url">Сайт (URL)</Label>
            <div className="flex items-center gap-2">
              {favicon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={favicon} alt="" className="h-6 w-6 rounded" />
              )}
              <Input
                id="url"
                name="url"
                placeholder="example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                defaultValue={d?.url ?? ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Сумма</Label>
              <Input id="amount" name="amount" type="number" step="0.01" required defaultValue={d?.amount} />
            </div>
            <div className="space-y-2">
              <Label>Валюта</Label>
              <Select name="currencyId" defaultValue={d?.currencyId ?? props.defaultCurrencyId}>
                <SelectTrigger><SelectValue placeholder="Валюта" /></SelectTrigger>
                <SelectContent>
                  {props.currencies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.code} ({c.symbol})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Период оплаты</Label>
              <Select name="billingCycle" value={cycle} onValueChange={setCycle} defaultValue={d?.billingCycle ?? "MONTHLY"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Ежемесячно</SelectItem>
                  <SelectItem value="QUARTERLY">Ежеквартально</SelectItem>
                  <SelectItem value="YEARLY">Ежегодно</SelectItem>
                  <SelectItem value="CUSTOM">Другой (в днях)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingEvery">Каждые N</Label>
              <Input id="billingEvery" name="billingEvery" type="number" min={1} required defaultValue={d?.billingEvery ?? 1} />
            </div>
          </div>
          {cycle === "CUSTOM" && (
            <div className="space-y-2">
              <Label htmlFor="billingUnitDays">Дней в цикле</Label>
              <Input id="billingUnitDays" name="billingUnitDays" type="number" min={1} defaultValue={d?.billingUnitDays ?? 30} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Дата начала</Label>
              <Input id="startDate" name="startDate" type="date" required defaultValue={d?.startDate?.slice(0, 10)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Дата окончания</Label>
              <Input id="endDate" name="endDate" type="date" defaultValue={props.editing?.endDate?.slice(0, 10) ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Заметки</Label>
            <Input id="notes" name="notes" defaultValue={d?.notes ?? ""} />
          </div>
          {props.groups.length > 0 && (
            <div className="space-y-2">
              <Label>Группы</Label>
              <div className="flex flex-wrap gap-3">
                {props.groups.map((g) => {
                  const checked = groupIds.includes(g.id);
                  return (
                    <label key={g.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setGroupIds((cur) => (v ? [...cur, g.id] : cur.filter((x) => x !== g.id)));
                        }}
                      />
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                        {g.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit">Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}