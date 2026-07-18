"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Receipt } from "lucide-react";
import { NAV } from "@/components/nav";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card/60 backdrop-blur md:flex">
      <div className="flex h-16 items-center gap-2.5 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25">
          <Receipt className="h-4 w-4" strokeWidth={2.2} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-lg font-bold tracking-tight">Subs</span>
          <span className="text-[11px] text-muted-foreground">учёт подписок</span>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Меню
        </p>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  active ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground",
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 text-[11px] text-muted-foreground/60">
        Subs · self-hosted
      </div>
    </aside>
  );
}
