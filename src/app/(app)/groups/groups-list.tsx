"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { deleteGroup } from "./actions";
import { GroupFormDialog } from "./group-form";

interface Row {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  count: number;
}

export function GroupsList({ groups }: { groups: Row[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Нет групп. Добавьте первую.</p>
      )}
      {groups.map((g) => (
        <Card key={g.id} className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 rounded-full" style={{ background: g.color }} />
            <div>
              <p className="font-medium">{g.name}</p>
              <Badge variant="secondary">{g.count} подписок</Badge>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <GroupFormDialog
              editing={g}
              trigger={
                <Button variant="ghost" size="icon" title="Изменить">
                  <Pencil className="h-4 w-4" />
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              title="Удалить"
              onClick={() => {
                if (!confirm(`Удалить группу «${g.name}»? Подписки не удалятся.`)) return;
                start(async () => {
                  await deleteGroup(g.id);
                  toast.success("Группа удалена");
                });
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}