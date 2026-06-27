import { LoginForm } from "../login-form";
import { loginStep2 } from "../actions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl ?? "/dashboard";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <LoginForm
        action={loginStep2}
        title="Двухфакторная авторизация"
        description="Введите код из приложения-аутентификатора"
        submitLabel="Подтвердить"
      >
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="space-y-2">
          <Label htmlFor="code">Код (6 цифр)</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            autoComplete="one-time-code"
            autoFocus
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">или резервный код</p>
        <div className="space-y-2">
          <Label htmlFor="backupCode">Резервный код</Label>
          <Input id="backupCode" name="backupCode" placeholder="XXXX-XXXX" autoComplete="off" />
        </div>
      </LoginForm>
    </div>
  );
}