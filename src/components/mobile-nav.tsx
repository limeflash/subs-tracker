"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NAV } from "@/components/nav";
import { cn } from "@/lib/utils";

export function MobileNav({
  open: controlledOpen,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
} = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const pathname = usePathname();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Меню">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
      )}
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex h-16 items-center gap-2.5 border-b px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25">
            <Receipt className="h-4 w-4" strokeWidth={2.2} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight">Subs</span>
            <span className="text-[11px] text-muted-foreground">учёт подписок</span>
          </div>
        </div>
        <nav className="space-y-0.5 p-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon className={cn("h-4 w-4", active && "text-primary")} />
                {label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
