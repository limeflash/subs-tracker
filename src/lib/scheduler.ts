import { runNotifications } from "@/lib/notify";
import { fetchAndStoreRates } from "@/lib/fetch-rates";
import { startBotPolling } from "@/lib/bot";

/**
 * In-process scheduler so Telegram notifications work out of the box, without
 * a host crontab. Started once from instrumentation.ts (nodejs runtime).
 *
 * - Notifications: tick every 15 min; the daily run fires at the first tick at
 *   or after 09:00 server-local time (NotificationLog dedups repeats).
 * - Exchange rates: refreshed once a day from 03:00.
 * External cron endpoints remain available and harmless (same dedup ledger).
 */

const TICK_MS = 15 * 60 * 1000;

let lastRatesDay = "";

export function startScheduler(): void {
  const tick = async () => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.toDateString();
    try {
      if (hour >= 9) {
        const res = await runNotifications(now);
        if (res.sent) console.log(`[scheduler] notifications sent:`, res);
      }
      if (hour >= 3 && lastRatesDay !== day) {
        lastRatesDay = day;
        const res = await fetchAndStoreRates();
        console.log(`[scheduler] rates refresh: ok=${res.ok}`);
      }
    } catch (e) {
      console.error("[scheduler] tick failed:", e);
    }
  };
  // first tick shortly after boot, then on the interval
  setTimeout(tick, 20_000);
  setInterval(tick, TICK_MS).unref();
  startBotPolling();
  console.log("[scheduler] started (15 min tick, daily notify from 09:00, bot polling)");
}
