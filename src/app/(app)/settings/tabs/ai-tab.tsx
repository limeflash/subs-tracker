"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { saveAi, testAiConnection, clearAi, type SettingsState } from "../actions";

interface Props {
  configured: boolean;
  model: string;
}

const SUGGESTED = ["qwen3.5:122b", "qwen3.5:35b", "gemma4:31b", "kimi-k2.6", "minimax-m3"];

export function AiTab(props: Props) {
  const [showForm, setShowForm] = useState(!props.configured);
  const [state, formAction] = useActionState(saveAi, undefined);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (state?.ok) { toast.success("AI сохранён"); setShowForm(false); }
    else if (state?.error) toast.error(state.error);
  }, [state]);

  if (props.configured && !showForm) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            AI-импорт <Badge variant="secondary">настроен</Badge>
          </CardTitle>
          <CardDescription>
            Модель: {props.model}. Скриншоты можно присылать боту или загружать на странице подписок.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowForm(true)}>Изменить ключ/модель</Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => start(async () => {
              const r = await testAiConnection();
              r.ok ? toast.success("Соединение работает") : toast.error(r.error ?? "Ошибка");
            })}
          >
            <Zap className="mr-2 h-4 w-4" /> Проверить
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => start(async () => { await clearAi(); toast.success("AI отключён"); window.location.reload(); })}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Отключить
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> AI-импорт (Ollama Cloud)
        </CardTitle>
        <CardDescription>
          Распознаёт подписки по скриншотам — на сайте и в Telegram-боте.
          Ключ: ollama.com → Settings → Keys.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">API key</Label>
            <Input id="apiKey" name="apiKey" type="password" required placeholder="••••••••" autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Модель (с vision)</Label>
            <Input id="model" name="model" list="ai-models" defaultValue={props.model} placeholder="qwen3.5:122b" />
            <datalist id="ai-models">
              {SUGGESTED.map((m) => <option key={m} value={m} />)}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Нужна мультимодальная модель: qwen3.5, gemma4, kimi-k2.6, minimax-m3…
            </p>
          </div>
          <Button type="submit">Проверить и сохранить</Button>
        </CardContent>
      </form>
    </Card>
  );
}
