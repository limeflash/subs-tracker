"use client";

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
  Receipt,
} from "lucide-react";
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

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Receipt className="h-4 w-4" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Subs</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
    </aside>
  );
}