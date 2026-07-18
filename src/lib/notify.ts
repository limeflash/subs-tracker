import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/telegram";
import { nextPaymentFrom, type BillingCycle } from "@/lib/periods";
import { formatMoney, formatDate } from "@/lib/utils";

/**
 * Daily notification run. Idempotent per (kind, refKey, day) via the
 * NotificationLog ledger, so it can be safely invoked by the internal
 * 15-minute scheduler AND by the external cron endpoint.
 */
export async function runNotifications(now = new Date()): Promise<{
  upcoming: number; dueToday: number; past: number; summary: boolean; sent: boolean;
}> {
  const user = await prisma.user.findFirst();
  if (!user?.telegramBotTokenCipher || !user.telegramChatId) {
    return { upcoming: 0, dueToday: 0, past: 0, summary: false, sent: false };
  }

  const day = localDay(now);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  let upcomingCount = 0;
  let dueTodayCount = 0;
  let pastCount = 0;
  let sent = false;

  const days = user.telegramNotifyDays
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 0);

  if (user.telegramNotifyUpcoming) {
    for (const d of days) {
      const target = new Date(startOfToday);
      target.setDate(target.getDate() + d);
      const subs = await prisma.subscription.findMany({
        where: {
          active: true,
          nextPaymentDate: { gte: target, lt: new Date(target.getTime() + 86_400_000) },
        },
        include: { currency: true },
      });
      if (subs.length === 0) continue;
      const refKey = d === 0 ? "due-today" : `in-${d}d`;
      if (!(await claim("UPCOMING", refKey, day))) continue;
      const lines = subs.map(
        (s) => `• <b>${escapeHtml(s.title)}</b> — ${formatMoney(Number(s.amount), s.currency.code)}`,
      );
      const header =
        d === 0
          ? "💸 Списания <b>сегодня</b>:"
          : d === 1
            ? "⏰ Списание <b>завтра</b>:"
            : `⏰ Списание через <b>${d} ${pluralDays(d)}</b>:`;
      const ok = await sendTelegram(`${header}\n${lines.join("\n")}`);
      if (ok) {
        sent = true;
        if (d === 0) dueTodayCount += subs.length;
        else upcomingCount += subs.length;
      } else {
        await release("UPCOMING", refKey, day); // allow retry on next tick
      }
    }
  }

  // past: nextPaymentDate <= now -> notify and advance the schedule.
  if (user.telegramNotifyPaid) {
    const past = await prisma.subscription.findMany({
      where: { active: true, nextPaymentDate: { lte: now } },
      include: { currency: true },
    });
    const fresh = [];
    for (const s of past) {
      if (await claim("PAID", `${s.id}:${s.nextPaymentDate.toISOString()}`, day)) fresh.push(s);
    }
    if (fresh.length > 0) {
      const lines = fresh.map(
        (s) => `• <b>${escapeHtml(s.title)}</b> — ${formatMoney(Number(s.amount), s.currency.code)}`,
      );
      const ok = await sendTelegram(`✅ Списания состоялись:\n${lines.join("\n")}`);
      if (ok) {
        sent = true;
        pastCount = fresh.length;
        // Roll forward to the first future date (not just +1 period) so a long
        // outage catches up. Only after the owner was actually notified.
        for (const s of fresh) {
          const cfg = {
            cycle: s.billingCycle as BillingCycle,
            every: s.billingEvery,
            unitDays: s.billingUnitDays,
          };
          const next = nextPaymentFrom(s.nextPaymentDate, now, cfg);
          await prisma.subscription.update({ where: { id: s.id }, data: { nextPaymentDate: next } });
        }
      } else {
        for (const s of fresh) await release("PAID", `${s.id}:${s.nextPaymentDate.toISOString()}`, day);
      }
    }
  }

  if (user.telegramNotifyPayroll) {
    const todayPayments = await prisma.salaryPayment.findMany({
      where: { paidAt: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 86_400_000) } },
      include: { currency: true, employee: true },
    });
    if (todayPayments.length > 0 && (await claim("PAYROLL", "all", day))) {
      const lines = todayPayments.map(
        (p) => `• <b>${escapeHtml(p.employee.name)}</b> — ${formatMoney(Number(p.amount), p.currency.code)} (${escapeHtml(p.periodLabel)})`,
      );
      const ok = await sendTelegram(`💳 Выплаты ЗП сегодня:\n${lines.join("\n")}`);
      if (ok) sent = true;
      else await release("PAYROLL", "all", day);
    }
  }

  // weekly summary on Mondays
  let summary = false;
  if (user.telegramNotifySummary && now.getDay() === 1 && (await claim("SUMMARY", "weekly", day))) {
    const since = new Date(now);
    since.setDate(since.getDate() - 7);
    const ahead = new Date(now);
    ahead.setDate(ahead.getDate() + 7);
    const [pastSubs, nextSubs, payments] = await Promise.all([
      prisma.subscription.findMany({ where: { nextPaymentDate: { gte: since, lt: now } }, include: { currency: true } }),
      prisma.subscription.findMany({ where: { active: true, nextPaymentDate: { gte: now, lt: ahead } }, include: { currency: true } }),
      prisma.salaryPayment.findMany({ where: { paidAt: { gte: since, lt: now } }, include: { currency: true } }),
    ]);
    const nextLines = nextSubs.slice(0, 10).map(
      (s) => `• <b>${escapeHtml(s.title)}</b> — ${formatMoney(Number(s.amount), s.currency.code)} · ${formatDate(s.nextPaymentDate)}`,
    );
    const txt =
      `📊 <b>Сводка за неделю</b>\n` +
      `Списаний за неделю: ${pastSubs.length}\n` +
      `Выплат ЗП: ${payments.length}\n` +
      (nextLines.length > 0 ? `\n<b>Впереди на 7 дней:</b>\n${nextLines.join("\n")}` : "");
    const ok = await sendTelegram(txt);
    if (ok) sent = true;
    else await release("SUMMARY", "weekly", day);
    summary = true;
  }

  return { upcoming: upcomingCount, dueToday: dueTodayCount, past: pastCount, summary, sent };
}

/** Instant confirmation when the owner marks a subscription as paid by hand. */
export async function notifyMarkedPaid(sub: {
  title: string; amount: number; currencyCode: string; nextPaymentDate: Date;
}): Promise<void> {
  await sendTelegram(
    `☑️ <b>${escapeHtml(sub.title)}</b> отмечена оплаченной — ${formatMoney(sub.amount, sub.currencyCode)}.\n` +
    `Следующее списание: ${formatDate(sub.nextPaymentDate)}`,
  ).catch(() => false);
}

function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Atomically claim a (kind, refKey, day) slot. False = already sent/claimed. */
async function claim(kind: string, refKey: string, day: string): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { kind, refKey, day } });
    return true;
  } catch {
    return false; // unique constraint -> already handled today
  }
}

/** Drop a claim so a failed send can be retried on the next tick. */
async function release(kind: string, refKey: string, day: string): Promise<void> {
  await prisma.notificationLog
    .delete({ where: { kind_refKey_day: { kind, refKey, day } } })
    .catch(() => null);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}
