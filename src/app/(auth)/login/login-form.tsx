"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Lock } from "lucide-react";
import type { LoginState } from "./actions";

export function LoginForm({
  action,
  title,
  description,
  submitLabel,
  children,
}: {
  action: (prev: LoginState | undefined, fd: FormData) => Promise<LoginState>;
  title: string;
  description: string;
  submitLabel: string;
  children?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state?.error && (
            <p className="text-sm font-medium text-destructive">{state.error}</p>
          )}
          {children}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full">
            {submitLabel}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}