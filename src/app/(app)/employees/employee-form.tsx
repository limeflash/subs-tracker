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
import { createEmployee, updateEmployee, type EmployeeState } from "./actions";

interface Props {
  trigger: React.ReactNode;
  editing?: { id: string; name: string; position?: string | null; contact?: string | null; notes?: string | null };
}

export function EmployeeFormDialog({ trigger, editing }: Props) {
  const [open, setOpen] = useState(false);
  const action = (_prev: EmployeeState | undefined, fd: FormData) =>
    editing ? updateEmployee(editing.id, fd) : createEmployee(undefined, fd);
  const [state, formAction] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.ok) { toast.success(editing ? "Сотрудник обновлён" : "Сотрудник добавлен"); setOpen(false); }
    else if (state?.error) toast.error(state.error);
  }, [state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Редактировать сотрудника" : "Новый сотрудник"}</DialogTitle></DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="name">Имя</Label><Input id="name" name="name" required defaultValue={editing?.name} /></div>
          <div className="space-y-2"><Label htmlFor="position">Должность</Label><Input id="position" name="position" defaultValue={editing?.position ?? ""} /></div>
          <div className="space-y-2"><Label htmlFor="contact">Контакт</Label><Input id="contact" name="contact" defaultValue={editing?.contact ?? ""} /></div>
          <div className="space-y-2"><Label htmlFor="notes">Заметки</Label><Input id="notes" name="notes" defaultValue={editing?.notes ?? ""} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit">Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}