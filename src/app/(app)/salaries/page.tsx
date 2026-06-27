export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { SalariesTable } from "./salaries-table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { SalaryFormDialog } from "../employees/salary-form";

export default async function SalariesPage() {
  const user = await requireUser();
  const [payments, employees, currencies] = await Promise.all([
    prisma.salaryPayment.findMany({
      include: { employee: true, currency: true },
      orderBy: { paidAt: "desc" },
    }),
    prisma.employee.findMany({ orderBy: { name: "asc" } }),
    prisma.currency.findMany({ orderBy: { code: "asc" } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const currencyList = currencies.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Выплаты ЗП</h1>
          <p className="text-sm text-muted-foreground">{payments.length} записей</p>
        </div>
        <SalaryFormDialog
          employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          currencies={currencyList}
          defaultCurrencyId={user.displayCurrencyId ?? currencies[0]?.id}
          today={today}
          trigger={<Button><Plus className="mr-2 h-4 w-4" /> Выплата</Button>}
        />
      </div>
      <SalariesTable
        payments={payments.map((p) => ({
          id: p.id,
          employeeName: p.employee.name,
          amount: Number(p.amount),
          currencySymbol: p.currency.symbol,
          periodLabel: p.periodLabel,
          paidAt: p.paidAt.toISOString(),
          notes: p.notes,
        }))}
      />
    </div>
  );
}