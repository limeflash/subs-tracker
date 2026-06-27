export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { EmployeesList } from "./employees-list";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { EmployeeFormDialog } from "./employee-form";

export default async function EmployeesPage() {
  const user = await requireUser();
  const [employees, currencies] = await Promise.all([
    prisma.employee.findMany({
      include: { salaryPayments: { include: { currency: true }, orderBy: { paidAt: "desc" }, take: 1 } },
      orderBy: { name: "asc" },
    }),
    prisma.currency.findMany({ orderBy: { code: "asc" } }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const currencyList = currencies.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol }));
  const defaultCurrencyId = user.displayCurrencyId ?? currencies[0]?.id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Сотрудники</h1>
          <p className="text-sm text-muted-foreground">{employees.length} сотрудников</p>
        </div>
        <EmployeeFormDialog trigger={<Button><Plus className="mr-2 h-4 w-4" /> Добавить</Button>} />
      </div>
      <EmployeesList
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          position: e.position,
          contact: e.contact,
          notes: e.notes,
          lastPayment: e.salaryPayments[0]
            ? { amount: Number(e.salaryPayments[0].amount), symbol: e.salaryPayments[0].currency.symbol, paidAt: e.salaryPayments[0].paidAt.toISOString() }
            : null,
        }))}
        currencies={currencyList}
        defaultCurrencyId={defaultCurrencyId}
        today={today}
      />
    </div>
  );
}