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
    <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-primary/5">
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state?.error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive">
              {state.error}
            </p>
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