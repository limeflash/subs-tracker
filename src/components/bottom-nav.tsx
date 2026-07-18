"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CreditCard, BarChart3, Settings, Menu } from "lucide-react";
import { MobileNav } from "./mobile-nav";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/subscriptions", label: "Подписки", icon: CreditCard },
  { href: "/statistics", label: "Статистика", icon: BarChart3 },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <MobileNav open={menuOpen} onOpenChange={setMenuOpen} />
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-primary")} strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            );
          })}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center gap-1 py-2 text-[10px] font-medium text-muted-foreground"
          >
            <Menu className="h-5 w-5" strokeWidth={1.8} />
            Меню
          </button>
        </div>
      </nav>
    </>
  );
}
