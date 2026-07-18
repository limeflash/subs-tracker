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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 bg-app-gradient" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[50rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>
          </div>
          <span className="text-2xl font-bold tracking-tight">Subs</span>
        </div>
        <LoginForm
          action={loginStep1}
          title="С возвращением"
          description="Войдите, чтобы управлять подписками"
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
    </div>
  );
}