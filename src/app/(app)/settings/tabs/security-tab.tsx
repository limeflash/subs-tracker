"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  beginTwoFactorSetup, enableTwoFactor, disableTwoFactor,
} from "../actions";

export function SecurityTab(props: { twoFactorEnabled: boolean; email: string; backupCount: number }) {
  const [enabling, setEnabling] = useState(false);
  const [setup, setSetup] = useState<{ qrUri: string; secret: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!setup) return;
    fetch(`/api/qr?text=${encodeURIComponent(setup.qrUri)}`)
      .then((r) => r.text())
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [setup]);

  function startSetup() {
    start(async () => {
      const res = await beginTwoFactorSetup();
      if (res.qrUri && res.secret) {
        setSetup({ qrUri: res.qrUri, secret: res.secret });
        setEnabling(true);
      } else if (res.error) {
        toast.error(res.error);
      }
    });
  }

  const [enableState, enableAction] = useActionState(enableTwoFactor, undefined);

  useEffect(() => {
    if (enableState?.ok) {
      toast.success("2FA включена. Сохраните резервные коды!");
      if (enableState.backupCodes) {
        setBackupCodes(enableState.backupCodes);
        setEnabling(false);
        setSetup(null);
        setQrDataUrl(null);
      }
    } else if (enableState?.error) {
      toast.error(enableState.error);
    }
  }, [enableState]);

  if (props.twoFactorEnabled && !enabling) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-500" /> 2FA включена</CardTitle>
          <CardDescription>Резервных кодов осталось: <Badge variant="secondary">{props.backupCount}</Badge></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {backupCodes && (
            <div className="rounded-md border bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Резервные коды (показаны один раз):</p>
              <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
                {backupCodes.map((c) => <div key={c}>{c}</div>)}
              </div>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => navigator.clipboard.writeText(backupCodes.join("\n"))}>
                <Copy className="mr-2 h-3 w-3" /> Скопировать
              </Button>
            </div>
          )}
          <Button variant="destructive" disabled={pending} onClick={() => start(async () => { await disableTwoFactor(); toast.success("2FA отключена"); window.location.reload(); })}>
            <ShieldAlert className="mr-2 h-4 w-4" /> Отключить 2FA
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!enabling) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> 2FA не включена</CardTitle>
          <CardDescription>Включите двухфакторную авторизацию (TOTP) для защиты аккаунта.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={startSetup} disabled={pending}>Включить 2FA</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Настройка 2FA</CardTitle>
        <CardDescription>Отсканируйте QR в приложении-аутентификаторе и введите код.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR" className="rounded border" />
          ) : (
            <div className="h-48 w-48 animate-pulse rounded border bg-muted" />
          )}
          <details className="w-full">
            <summary className="cursor-pointer text-xs text-muted-foreground">Ввести ключ вручную</summary>
            <code className="mt-1 block break-all rounded bg-muted p-2 text-xs">{setup?.secret}</code>
          </details>
        </div>
        <form action={enableAction} className="space-y-3">
          <input type="hidden" name="secret" value={setup?.secret ?? ""} />
          <div className="space-y-2">
            <Label htmlFor="code">Код из приложения (6 цифр)</Label>
            <Input id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoFocus />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => { setEnabling(false); setSetup(null); setQrDataUrl(null); }}>Отмена</Button>
            <Button type="submit">Подтвердить и включить</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}