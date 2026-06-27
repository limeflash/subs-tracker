"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { createGroup, updateGroup, type GroupState } from "./actions";

interface Props {
  trigger: React.ReactNode;
  editing?: { id: string; name: string; color: string; icon?: string | null };
}

export function GroupFormDialog({ trigger, editing }: Props) {
  const [open, setOpen] = useState(false);
  const action = (_prev: GroupState | undefined, fd: FormData) =>
    editing ? updateGroup(editing.id, fd) : createGroup(undefined, fd);
  const [state, formAction] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.ok) {
      toast.success(editing ? "Группа обновлена" : "Группа добавлена");
      setOpen(false);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Редактировать группу" : "Новая группа"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название</Label>
            <Input id="name" name="name" required defaultValue={editing?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">Цвет</Label>
            <Input id="color" name="color" type="color" defaultValue={editing?.color ?? "#64748b"} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit">Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}