import { prisma } from "@/lib/db";
import { sendTelegram, getTelegramConfig } from "@/lib/telegram";
import { nextPaymentFrom, type BillingCycle } from "@/lib/periods";
import { formatMoney, formatDate } from "@/lib/utils";

/**
 * Daily notification run. Reads the owner's notify flags + notifyDays, then:
 *  - upcoming: subscriptions whose nextPaymentDate is within notifyDays (and not today-past)
 *  - past: subscriptions whose nextPaymentDate <= now -> notify "состоялось", advance schedule
 *  - summary: weekly digest on Mondays
 * All best-effort; returns a report.
 */
export async function runNotifications(now = new Date()): Promise<{
  upcoming: number; past: number; summary: boolean; sent: boolean;
}> {
  const cfg = await getTelegramConfig();
  if (!cfg) return { upcoming: 0, past: 0, summary: false, sent: false };

  const user = await prisma.user.findFirst();
  if (!user) return { upcoming: 0, past: 0, summary: false, sent: false };

  const days = user.telegramNotifyDays
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  let upcomingCount = 0;
  let pastCount = 0;
  let sent = false;

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
      const lines = subs.map(
        (s) => `• <b>${escapeHtml(s.title)}</b> — ${formatMoney(Number(s.amount), s.currency.code)} · ${formatDate(s.nextPaymentDate)}`,
      );
      const ok = await sendTelegram(
        `⏰ Списание через ${d} ${pluralDays(d)}:\n${lines.join("\n")}`,
      );
      if (ok) sent = true;
      upcomingCount += subs.length;
    }
  }

  // past: nextPaymentDate <= now -> notify and advance
  if (user.telegramNotifyPaid) {
    const past = await prisma.subscription.findMany({
      where: { active: true, nextPaymentDate: { lte: now } },
      include: { currency: true },
    });
    if (past.length > 0) {
      const lines = past.map(
        (s) => `• <b>${escapeHtml(s.title)}</b> — ${formatMoney(Number(s.amount), s.currency.code)}`,
      );
      const ok = await sendTelegram(`✅ Списания состоялись:\n${lines.join("\n")}`);
      if (ok) sent = true;
      pastCount = past.length;
      // Only advance the schedule once the owner was actually notified —
      // otherwise a Telegram outage would silently roll dates forward and we'd
      // lose the "you missed a payment" signal. Roll forward to the first
      // future date (not just +1 period) so a long outage catches up.
      if (ok) {
        for (const s of past) {
          const cfg = {
            cycle: s.billingCycle as BillingCycle,
            every: s.billingEvery,
            unitDays: s.billingUnitDays,
          };
          const next = nextPaymentFrom(s.nextPaymentDate, now, cfg);
          await prisma.subscription.update({ where: { id: s.id }, data: { nextPaymentDate: next } });
        }
      }
    }
  }

  // payroll notifications: payments recorded today (already audited on creation);
  // notify is sent at creation time via createSalary hook (optional). Here we just
  // could send a daily payroll digest if any payments landed today.
  if (user.telegramNotifyPayroll) {
    const todayPayments = await prisma.salaryPayment.findMany({
      where: { paidAt: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 86_400_000) } },
      include: { currency: true, employee: true },
    });
    if (todayPayments.length > 0) {
      const lines = todayPayments.map(
        (p) => `• <b>${escapeHtml(p.employee.name)}</b> — ${formatMoney(Number(p.amount), p.currency.code)} (${escapeHtml(p.periodLabel)})`,
      );
      const ok = await sendTelegram(`💳 Выплаты ЗП сегодня:\n${lines.join("\n")}`);
      if (ok) sent = true;
    }
  }

  // weekly summary on Mondays
  let summary = false;
  if (user.telegramNotifySummary && now.getDay() === 1) {
    const since = new Date(now);
    since.setDate(since.getDate() - 7);
    const [subs, payments] = await Promise.all([
      prisma.subscription.findMany({ where: { nextPaymentDate: { gte: since, lt: now } }, include: { currency: true } }),
      prisma.salaryPayment.findMany({ where: { paidAt: { gte: since, lt: now } }, include: { currency: true } }),
    ]);
    const txt = `📊 Сводка за неделю:\nСписаний: ${subs.length}\nВыплат ЗП: ${payments.length}`;
    const ok = await sendTelegram(txt);
    if (ok) sent = true;
    summary = true;
  }

  return { upcoming: upcomingCount, past: pastCount, summary, sent };
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