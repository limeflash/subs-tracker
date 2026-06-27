export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { latestSnapshotToBase } from "@/lib/exchange";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileTab } from "./tabs/profile-tab";
import { SecurityTab } from "./tabs/security-tab";
import { CurrenciesTab } from "./tabs/currencies-tab";
import { TelegramTab } from "./tabs/telegram-tab";

export default async function SettingsPage() {
  const user = await requireUser();
  const currencies = await prisma.currency.findMany({ orderBy: { code: "asc" } });
  const base = currencies.find((c) => c.isBase) ?? currencies[0];

  // Live market snapshot (ignores override) per non-base currency, for display.
  const snapshots = new Map<string, { rate: number; date: Date } | null>();
  await Promise.all(
    currencies.map(async (c) => {
      snapshots.set(c.id, base && !c.isBase ? await latestSnapshotToBase(c, base) : null);
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="profile">Профиль</TabsTrigger>
          <TabsTrigger value="security">Безопасность</TabsTrigger>
          <TabsTrigger value="currencies">Валюты</TabsTrigger>
          <TabsTrigger value="telegram">Telegram</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <ProfileTab
            email={user.email}
            displayCurrencyId={user.displayCurrencyId ?? currencies[0]?.id}
            currencies={currencies.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol }))}
          />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecurityTab twoFactorEnabled={user.twoFactorEnabled} email={user.email} backupCount={user.backupCodesHash.length} />
        </TabsContent>
        <TabsContent value="currencies" className="mt-4">
          <CurrenciesTab
            baseCode={base?.code ?? ""}
            currencies={currencies.map((c) => ({
              id: c.id,
              code: c.code,
              symbol: c.symbol,
              isBase: c.isBase,
              overrideRateToBase: c.overrideRateToBase ? Number(c.overrideRateToBase) : null,
              snapshot: (() => {
                const s = snapshots.get(c.id) ?? null;
                return s ? { rate: s.rate, date: s.date.toISOString() } : null;
              })(),
            }))}
          />
        </TabsContent>
        <TabsContent value="telegram" className="mt-4">
          <TelegramTab
            configured={!!user.telegramBotTokenCipher && !!user.telegramChatId}
            chatId={user.telegramChatId ?? ""}
            notifyUpcoming={user.telegramNotifyUpcoming}
            notifyPaid={user.telegramNotifyPaid}
            notifyPayroll={user.telegramNotifyPayroll}
            notifySummary={user.telegramNotifySummary}
            notifyDays={user.telegramNotifyDays}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}