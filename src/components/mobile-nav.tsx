"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CreditCard,
  FolderTree,
  Users,
  Wallet,
  BarChart3,
  Settings,
  Menu,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/subscriptions", label: "Подписки", icon: CreditCard },
  { href: "/groups", label: "Группы", icon: FolderTree },
  { href: "/employees", label: "Сотрудники", icon: Users },
  { href: "/salaries", label: "Выплаты", icon: Wallet },
  { href: "/statistics", label: "Статистика", icon: BarChart3 },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Меню">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Receipt className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Subs</span>
        </div>
        <nav className="space-y-1 p-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}