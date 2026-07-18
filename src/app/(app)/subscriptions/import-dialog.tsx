"use client";

import { useRef, useState, useTransition } from "react";
import { Sparkles, Loader2, ImagePlus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { parseScreenshot, type ParsedItem } from "./actions";
import { SubscriptionFormDialog } from "./subscription-form";

const CYCLE_LABEL: Record<string, string> = {
  MONTHLY: "ежемесячно",
  QUARTERLY: "ежеквартально",
  YEARLY: "ежегодно",
  CUSTOM: "другой период",
};

interface Props {
  groups: { id: string; name: string; color: string }[];
  currencies: { id: string; code: string; symbol: string }[];
  defaultCurrencyId?: string;
}

export function ImportDialog({ groups, currencies, defaultCurrencyId }: Props) {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [selected, setSelected] = useState<ParsedItem | null>(null);
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Нужно изображение (скриншот)");
      return;
    }
    if (file.size > 7 * 1024 * 1024) {
      toast.error("Файл слишком большой (макс 7 МБ)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.split(",")[1] ?? "";
      start(async () => {
        const res = await parseScreenshot(base64);
        if (!res.ok) {
          toast.error(res.error ?? "Не удалось распознать");
          return;
        }
        setItems(res.items ?? []);
        if ((res.items ?? []).length === 0) toast.info("Подписки не найдены на изображении");
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Sparkles className="mr-2 h-4 w-4 text-primary" /> Из скриншота
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Импорт по скриншоту</DialogTitle>
            <DialogDescription>
              AI распознает подписку со скриншота страницы оплаты и заполнит форму.
            </DialogDescription>
          </DialogHeader>

          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              drag ? "border-primary bg-accent" : "border-border hover:border-primary/50 hover:bg-accent/50"
            }`}
          >
            {pending ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Распознаю…</p>
                <p className="text-xs text-muted-foreground">обычно 5–15 секунд</p>
              </>
            ) : (
              <>
                <ImagePlus className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Перетащите скриншот сюда</p>
                <p className="text-xs text-muted-foreground">или нажмите, чтобы выбрать файл</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {it.amount.toLocaleString("ru-RU")} {it.currency} · {CYCLE_LABEL[it.cycle] ?? it.cycle}
                      {it.nextPaymentDate ? ` · с ${it.nextPaymentDate}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelected(it);
                      setFormOpen(true);
                    }}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> В форму
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {selected && (
        <SubscriptionFormDialog
          key={JSON.stringify(selected)}
          groups={groups}
          currencies={currencies}
          defaultCurrencyId={defaultCurrencyId}
          open={formOpen}
          onOpenChange={(v) => {
            setFormOpen(v);
            if (!v) setSelected(null);
          }}
          prefill={{
            title: selected.title,
            url: selected.url,
            amount: selected.amount,
            currencyId: selected.currencyId,
            billingCycle: selected.cycle,
            billingEvery: selected.every,
            billingUnitDays: selected.unitDays,
            startDate: selected.nextPaymentDate ?? new Date().toISOString().slice(0, 10),
            notes: selected.notes,
          }}
        />
      )}
    </>
  );
}
