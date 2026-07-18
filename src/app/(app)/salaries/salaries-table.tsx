"use client";

import { useState, useTransition } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { deleteSalary } from "../employees/actions";

interface Row {
  id: string;
  employeeName: string;
  amount: number;
  currencySymbol: string;
  periodLabel: string;
  paidAt: string;
  notes?: string | null;
}

export function SalariesTable({ payments }: { payments: Row[] }) {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const filtered = payments.filter((p) =>
    [p.employeeName, p.periodLabel].join(" ").toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Сотрудник</TableHead>
              <TableHead>Период</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Нет выплат</TableCell></TableRow>
            )}
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.employeeName}</TableCell>
                <TableCell>{p.periodLabel}{p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}</TableCell>
                <TableCell className="text-right tabular-nums">{p.amount.toLocaleString("ru-RU")} {p.currencySymbol}</TableCell>
                <TableCell className="text-sm">{formatDate(p.paidAt)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost" size="icon" disabled={pending} title="Удалить"
                    onClick={() => { if (confirm("Удалить запись о выплате?")) { start(async () => { await deleteSalary(p.id); toast.success("Удалено"); }); } }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}