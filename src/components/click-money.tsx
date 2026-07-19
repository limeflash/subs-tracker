"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Money shown in the display currency; click toggles to the native currency.
 * Falls back to native-only (no toggle) when conversion was unavailable.
 */
export function ClickMoney({
  converted,
  native,
  className,
}: {
  converted: string | null;
  native: string;
  className?: string;
}) {
  const [showNative, setShowNative] = useState(false);
  if (converted == null || converted === native) {
    return <span className={cn("tabular-nums", className)}>{native}</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setShowNative((v) => !v);
      }}
      title={showNative ? "В валюте подписки — клик: показать сконвертированную" : "Сконвертировано — клик: нативная валюта"}
      className={cn(
        "cursor-pointer tabular-nums underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground",
        className,
      )}
    >
      {showNative ? native : converted}
    </button>
  );
}
