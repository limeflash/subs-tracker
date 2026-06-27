export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { SubscriptionsTable } from "./subscriptions-table";
import { SubscriptionFormDialog } from "./subscription-form";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function SubscriptionsPage() {
  const user = await requireUser();
  const [subscriptions, groups, currencies] = await Promise.all([
    prisma.subscription.findMany({
      include: { currency: true, groups: { include: { group: true } } },
      orderBy: [{ active: "desc" }, { nextPaymentDate: "asc" }],
    }),
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    prisma.currency.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Подписки</h1>
          <p className="text-sm text-muted-foreground">
            {subscriptions.length} записей
          </p>
        </div>
        <SubscriptionFormDialog
          groups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
          currencies={currencies.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol }))}
          defaultCurrencyId={user?.displayCurrencyId ?? currencies[0]?.id}
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Добавить
            </Button>
          }
        />
      </div>
      <SubscriptionsTable
        groups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
        currencies={currencies.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol }))}
        subscriptions={subscriptions.map((s) => ({
          id: s.id,
          title: s.title,
          url: s.url,
          faviconUrl: s.faviconUrl,
          amount: Number(s.amount),
          currencyId: s.currencyId,
          currencyCode: s.currency.code,
          currencySymbol: s.currency.symbol,
          billingCycle: s.billingCycle,
          billingEvery: s.billingEvery,
          billingUnitDays: s.billingUnitDays,
          startDate: s.startDate.toISOString(),
          endDate: s.endDate ? s.endDate.toISOString() : null,
          nextPaymentDate: s.nextPaymentDate.toISOString(),
          active: s.active,
          notes: s.notes,
          groups: s.groups.map((g) => g.group.name),
          groupIds: s.groups.map((g) => g.groupId),
        }))}
      />
    </div>
  );
}