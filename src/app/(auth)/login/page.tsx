import { LoginForm } from "./login-form";
import { loginStep1 } from "./actions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl ?? "/dashboard";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <LoginForm
        action={loginStep1}
        title="Вход"
        description="Subs — учёт подписок"
        submitLabel="Войти"
      >
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      </LoginForm>
    </div>
  );
}