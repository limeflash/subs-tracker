"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { updateProfile, type SettingsState } from "../actions";

export function ProfileTab(props: { email: string; displayCurrencyId?: string; currencies: { id: string; code: string; symbol: string }[] }) {
  const [currencyId, setCurrencyId] = useState(props.displayCurrencyId ?? props.currencies[0]?.id);
  const [showPw, setShowPw] = useState(false);
  const [state, formAction] = useActionState(updateProfile, undefined);
  useEffect(() => {
    if (state?.ok) toast.success("Профиль сохранён");
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Профиль</CardTitle>
        <CardDescription>Email, пароль и валюта отображения</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required defaultValue={props.email} />
          </div>
          <div className="space-y-2">
            <Label>Валюта отображения</Label>
            <Select name="displayCurrencyId" value={currencyId} onValueChange={setCurrencyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {props.currencies.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} ({c.symbol})</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">В эту валюту пересчитываются все суммы в дашборде и статистике.</p>
          </div>
          <div className="rounded-md border p-3 space-y-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowPw((v) => !v)}>
              {showPw ? "Отменить смену пароля" : "Сменить пароль"}
            </Button>
            {showPw && (
              <div className="space-y-3">
                <div className="space-y-2"><Label htmlFor="currentPassword">Текущий пароль</Label><Input id="currentPassword" name="currentPassword" type="password" /></div>
                <div className="space-y-2"><Label htmlFor="newPassword">Новый пароль (мин. 8)</Label><Input id="newPassword" name="newPassword" type="password" minLength={8} /></div>
              </div>
            )}
          </div>
          <Button type="submit">Сохранить</Button>
        </CardContent>
      </form>
    </Card>
  );
}