"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import { Search, Moon, Sun, LogOut, Plus, ArrowRight } from "lucide-react";
import { signOut } from "next-auth/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NAV } from "@/components/nav";

export function CommandMenu({ variant = "full" }: { variant?: "full" | "icon" }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const itemCls =
    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors aria-selected:bg-accent aria-selected:text-accent-foreground";

  return (
    <>
      {variant === "full" ? (
        <button
          onClick={() => setOpen(true)}
          className="hidden h-9 w-44 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex lg:w-56"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 truncate text-left">Поиск…</span>
          <kbd className="pointer-events-none flex h-5 items-center gap-0.5 rounded border bg-background px-1.5 font-sans text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="Поиск"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:hidden"
        >
          <Search className="h-4 w-4" />
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[18%] max-w-lg translate-y-0 gap-0 overflow-hidden border-border/60 p-0 shadow-2xl">
          <DialogTitle className="sr-only">Меню команд</DialogTitle>
          <Command label="Меню команд" loop>
            <div className="flex items-center border-b px-4">
              <Search className="mr-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                placeholder="Куда переходим?"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                Ничего не найдено
              </Command.Empty>
              <Command.Group
                heading="Навигация"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/70"
              >
                {NAV.map(({ href, label, icon: Icon }) => (
                  <Command.Item key={href} value={label} onSelect={() => go(href)} className={itemCls}>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group
                heading="Действия"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/70"
              >
                <Command.Item value="Добавить подписку" onSelect={() => go("/subscriptions")} className={itemCls}>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Добавить подписку</span>
                </Command.Item>
                <Command.Item
                  value="Переключить тему"
                  onSelect={() => {
                    setTheme(theme === "dark" ? "light" : "dark");
                    setOpen(false);
                  }}
                  className={itemCls}
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Moon className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="flex-1">Переключить тему</span>
                </Command.Item>
                <Command.Item
                  value="Выйти из аккаунта"
                  onSelect={() => signOut({ callbackUrl: "/login" })}
                  className={itemCls}
                >
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Выйти</span>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
