"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveTelegram, testTelegram, clearTelegram, updateNotifyFlags, runNotificationsNow, type SettingsState } from "../actions";

interface Props {
  configured: boolean;
  chatId: string;
  notifyUpcoming: boolean; notifyPaid: boolean; notifyPayroll: boolean; notifySummary: boolean;
  notifyDays: string;
}

export function TelegramTab(props: Props) {
  const [showForm, setShowForm] = useState(!props.configured);
  const [state, formAction] = useActionState(saveTelegram, undefined);
  const [pending, start] = useTransition();

  const [upcoming, setUpcoming] = useState(props.notifyUpcoming);
  const [paid, setPaid] = useState(props.notifyPaid);
  const [payroll, setPayroll] = useState(props.notifyPayroll);
  const [summary, setSummary] = useState(props.notifySummary);

  const saveFlags = (next: { upcoming: boolean; paid: boolean; payroll: boolean; summary: boolean }) =>
    start(async () => {
      await updateNotifyFlags(next);
      toast.success("Сохранено");
    });

  useEffect(() => {
    if (state?.ok) { toast.success("Telegram сохранён"); setShowForm(false); }
    else if (state?.error) toast.error(state.error);
  }, [state]);

  if (props.configured && !showForm) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Telegram <Badge variant="secondary">настроен</Badge></CardTitle>
          <CardDescription>
            chat_id: {props.chatId} · бот принимает команды: /upcoming, /today, /paid, /month, /help
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-md border p-3">
            <Toggle label="Предстоящие списания" checked={upcoming} on={(v) => { setUpcoming(v); saveFlags({ upcoming: v, paid, payroll, summary }); }} />
            <Toggle label="Состоявшиеся списания" checked={paid} on={(v) => { setPaid(v); saveFlags({ upcoming, paid: v, payroll, summary }); }} />
            <Toggle label="Выплаты ЗП" checked={payroll} on={(v) => { setPayroll(v); saveFlags({ upcoming, paid, payroll: v, summary }); }} />
            <Toggle label="Сводка за период" checked={summary} on={(v) => { setSummary(v); saveFlags({ upcoming, paid, payroll, summary: v }); }} />
            <p className="text-xs text-muted-foreground">
              Отправляются автоматически каждый день после 09:00 — внешний cron не нужен.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowForm(true)}>Изменить токен/chat_id</Button>
            <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await testTelegram(); r.ok ? toast.success("Тест отправлен") : toast.error(r.error ?? "Ошибка"); })}>
              <Send className="mr-2 h-4 w-4" /> Тест
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await runNotificationsNow(); r.ok ? toast.success("Уведомления отправлены") : toast.error(r.error ?? "Ошибка"); })}>
              Отправить сейчас
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await clearTelegram(); toast.success("Telegram отключён"); window.location.reload(); })}>
              <Trash2 className="mr-2 h-4 w-4" /> Отключить
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>Создайте бота у @BotFather (/newbot) и получите chat_id (например, у @userinfobot).</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="botToken">Bot token</Label><Input id="botToken" name="botToken" required placeholder="123456:ABC-DEF..." /></div>
          <div className="space-y-2"><Label htmlFor="chatId">Chat ID</Label><Input id="chatId" name="chatId" required defaultValue={props.chatId} placeholder="123456789" /></div>
          <input type="hidden" name="notifyDays" value={props.notifyDays} />
          <div className="space-y-3 rounded-md border p-3">
            <ToggleInput label="Предстоящие списания" name="notifyUpcoming" defaultChecked={upcoming} />
            <ToggleInput label="Состоявшиеся списания" name="notifyPaid" defaultChecked={paid} />
            <ToggleInput label="Выплаты ЗП" name="notifyPayroll" defaultChecked={payroll} />
            <ToggleInput label="Сводка за период" name="notifySummary" defaultChecked={summary} />
          </div>
          <Button type="submit">Сохранить</Button>
        </CardContent>
      </form>
    </Card>
  );
}

function Toggle({ label, checked, on }: { label: string; checked: boolean; on: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={on} />
    </div>
  );
}

function ToggleInput({ label, name, defaultChecked }: { label: string; name: string; defaultChecked: boolean }) {
  const [v, setV] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <Switch checked={v} onCheckedChange={setV} />
        {v && <input type="hidden" name={name} value="on" />}
      </div>
    </div>
  );
}