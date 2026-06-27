"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { deleteEmployee } from "./actions";
import { EmployeeFormDialog } from "./employee-form";
import { SalaryFormDialog } from "./salary-form";

interface Row {
  id: string;
  name: string;
  position?: string | null;
  contact?: string | null;
  notes?: string | null;
  lastPayment: { amount: number; symbol: string; paidAt: string } | null;
}

interface Props {
  employees: Row[];
  currencies: { id: string; code: string; symbol: string }[];
  defaultCurrencyId?: string;
  today: string;
}

export function EmployeesList({ employees, currencies, defaultCurrencyId, today }: Props) {
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {employees.length === 0 && <p className="text-sm text-muted-foreground">Нет сотрудников.</p>}
      {employees.map((e) => (
        <Card key={e.id} className="space-y-3 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">{e.name}</p>
              {e.position && <p className="text-sm text-muted-foreground">{e.position}</p>}
              {e.contact && <p className="text-xs text-muted-foreground">{e.contact}</p>}
            </div>
            <div className="flex items-center gap-1">
              <EmployeeFormDialog
                editing={e}
                trigger={<Button variant="ghost" size="icon" title="Изменить"><Pencil className="h-4 w-4" /></Button>}
              />
              <Button
                variant="ghost" size="icon" disabled={pending} title="Удалить"
                onClick={() => { if (confirm(`Удалить «${e.name}»? История выплат будет удалена.`)) { start(async () => { await deleteEmployee(e.id); toast.success("Удалён"); }); } }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="text-sm">
            {e.lastPayment ? (
              <p className="text-muted-foreground">
                Последняя выплата: {e.lastPayment.amount.toLocaleString("ru-RU")} {e.lastPayment.symbol} · {formatDate(e.lastPayment.paidAt)}
              </p>
            ) : (
              <p className="text-muted-foreground">Выплат ещё не было</p>
            )}
          </div>
          <SalaryFormDialog
            employees={[{ id: e.id, name: e.name }]}
            currencies={currencies}
            defaultCurrencyId={defaultCurrencyId}
            defaultEmployeeId={e.id}
            today={today}
            trigger={<Button variant="outline" size="sm" className="w-full"><Wallet className="mr-2 h-4 w-4" /> Заплатить</Button>}
          />
        </Card>
      ))}
    </div>
  );
}