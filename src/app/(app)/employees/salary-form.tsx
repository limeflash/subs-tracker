"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createSalary, type SalaryState } from "./actions";

interface Props {
  employees: { id: string; name: string }[];
  currencies: { id: string; code: string; symbol: string }[];
  defaultCurrencyId?: string;
  defaultEmployeeId?: string;
  today: string;
  trigger: React.ReactNode;
}

export function SalaryFormDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(props.defaultEmployeeId ?? "");
  const [currencyId, setCurrencyId] = useState(props.defaultCurrencyId ?? "");
  const [state, formAction] = useActionState(createSalary, undefined);

  useEffect(() => {
    if (state?.ok) { toast.success("Выплата зарегистрирована"); setOpen(false); }
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Выплата ЗП</DialogTitle></DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label>Сотрудник</Label>
            <Select name="employeeId" value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
              <SelectContent>
                {props.employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label htmlFor="amount">Сумма</Label><Input id="amount" name="amount" type="number" step="0.01" required /></div>
            <div className="space-y-2">
              <Label>Валюта</Label>
              <Select name="currencyId" value={currencyId} onValueChange={setCurrencyId}>
                <SelectTrigger><SelectValue placeholder="Валюта" /></SelectTrigger>
                <SelectContent>
                  {props.currencies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.code} ({c.symbol})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2"><Label htmlFor="paidAt">Дата выплаты</Label><Input id="paidAt" name="paidAt" type="date" required defaultValue={props.today} /></div>
          <div className="space-y-2"><Label htmlFor="periodLabel">Период</Label><Input id="periodLabel" name="periodLabel" required placeholder="Оклад за июнь 2026" /></div>
          <div className="space-y-2"><Label htmlFor="notes">Заметки</Label><Input id="notes" name="notes" /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit">Записать</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}