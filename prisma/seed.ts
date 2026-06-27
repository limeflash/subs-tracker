/* eslint-disable no-console */
import { PrismaClient, type Currency } from "@prisma/client";

const prisma = new PrismaClient();

// Argon2id hash for the demo password "TestPass123!" — precomputed so the
// seed runs in the slim runner container without the native argon2 module.
// For a real production owner, set SEED_OWNER_PASSWORD_HASH (argon2id) instead
// of SEED_OWNER_PASSWORD, or run `npm run db:seed` locally where argon2 exists.
const DEMO_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$vap37Nn1Ee01TVHLg8GHrw$qlbKZl0LNyof06N8oUWkvf4AdlWLU3APtJPr6UjQZQg";

// Currencies the user tracks. isBase marks the default denominator (USD here).
// TRY = Turkish lira, EUR = euros, RUB = rubles, USD = dollars — per the request.
const CURRENCIES: Pick<Currency, "code" | "symbol" | "isBase">[] = [
  { code: "USD", symbol: "$", isBase: true },
  { code: "TRY", symbol: "₺", isBase: false },
  { code: "EUR", symbol: "€", isBase: false },
  { code: "RUB", symbol: "₽", isBase: false },
];

async function main() {
  const email = process.env.SEED_OWNER_EMAIL;
  const passwordHash = process.env.SEED_OWNER_PASSWORD_HASH ?? (process.env.SEED_DEMO === "1" ? DEMO_PASSWORD_HASH : undefined);
  if (!email || !passwordHash) {
    throw new Error(
      "SEED_OWNER_EMAIL and (SEED_OWNER_PASSWORD_HASH or SEED_DEMO=1) must be set to seed the owner account",
    );
  }

  console.log("→ upserting currencies");
  const currencies: Record<string, Currency> = {};
  for (const c of CURRENCIES) {
    const cur = await prisma.currency.upsert({
      where: { code: c.code },
      update: { symbol: c.symbol, isBase: c.isBase },
      create: c,
    });
    currencies[c.code] = cur;
  }

  console.log("→ seeding base exchange rates for today (approximate fallbacks)");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Rates expressed as 1 unit of base_in column => rate units of quote.
  // These are placeholder fallbacks; the daily cron (src/lib/fetch-rates.ts)
  // refreshes the full matrix from open.er-api.com (frankfurter.app fallback).
  const seedRates: [string, string, number][] = [
    ["USD", "TRY", 32.5],
    ["USD", "EUR", 0.92],
    ["USD", "RUB", 92],
    ["EUR", "TRY", 35.3],
    ["EUR", "RUB", 100],
    ["TRY", "RUB", 2.83],
  ];
  for (const [baseCode, quoteCode, rate] of seedRates) {
    await prisma.exchangeRate.upsert({
      where: {
        baseId_quoteId_date: {
          baseId: currencies[baseCode].id,
          quoteId: currencies[quoteCode].id,
          date: today,
        },
      },
      update: { rate },
      create: {
        baseId: currencies[baseCode].id,
        quoteId: currencies[quoteCode].id,
        rate,
        date: today,
      },
    });
  }

  console.log("→ upserting owner account");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayCurrency: { connect: { code: "RUB" } },
      },
    });
    console.log(`  created owner ${email}`);
  } else {
    console.log(`  owner ${email} already exists (left unchanged)`);
  }

  // Demo data — only when SEED_DEMO=1 and nothing exists yet.
  if (process.env.SEED_DEMO === "1") {
    await seedDemo(currencies);
  }

  console.log("✓ seed complete");
}

/** Populate a realistic demo dataset for local preview. Idempotent-ish. */
async function seedDemo(currencies: Record<string, Currency>) {
  const subsCount = await prisma.subscription.count();
  if (subsCount > 0) {
    console.log("  demo data already present — skipping");
    return;
  }

  console.log("→ seeding DEMO data");

  // ---- groups ----
  const groups = await Promise.all([
    prisma.group.create({ data: { name: "Хостинг и VPS", color: "#6366f1" } }),
    prisma.group.create({ data: { name: "Разработка", color: "#10b981" } }),
    prisma.group.create({ data: { name: "Дизайн и медиа", color: "#f59e0b" } }),
    prisma.group.create({ data: { name: "Продуктивность", color: "#ef4444" } }),
    prisma.group.create({ data: { name: "Фриланс-сервисы", color: "#3b82f6" } }),
  ]);
  const [hosting, dev, media, prod, freelance] = groups;

  // ---- exchange rates for today (all pairs relative to USD base) ----
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const usdTo: Record<string, number> = { USD: 1, TRY: 32.6, EUR: 0.92, RUB: 91.5 };
  const codes = Object.keys(usdTo);
  for (const b of codes) {
    for (const q of codes) {
      if (b === q) continue;
      const rate = usdTo[q] / usdTo[b];
      await prisma.exchangeRate.upsert({
        where: { baseId_quoteId_date: { baseId: currencies[b].id, quoteId: currencies[q].id, date: today } },
        update: { rate },
        create: { baseId: currencies[b].id, quoteId: currencies[q].id, rate, date: today },
      });
    }
  }

  // ---- subscriptions ----
  // helper: nextPaymentDate computed from start rolling forward to first future
  function nextDate(start: Date, months: number): Date {
    const now = new Date();
    const d = new Date(start);
    while (d.getTime() <= now.getTime()) {
      d.setMonth(d.getMonth() + months);
    }
    return d;
  }

  interface DemoSub { title: string; url: string; amount: number; cur: string; cycle: "MONTHLY"|"QUARTERLY"|"YEARLY"; every: number; startMonthsAgo: number; group: typeof hosting; }

  const demoSubs: DemoSub[] = [
    { title: "GitHub Pro", url: "github.com", amount: 4, cur: "USD", cycle: "MONTHLY", every: 1, startMonthsAgo: 8, group: dev },
    { title: "FreeHost VPS #1", url: "freehosting.com", amount: 250, cur: "TRY", cycle: "MONTHLY", every: 1, startMonthsAgo: 14, group: hosting },
    { title: "FreeHost VPS #2", url: "freehosting.com", amount: 250, cur: "TRY", cycle: "MONTHLY", every: 1, startMonthsAgo: 6, group: hosting },
    { title: "FreeHost VPS #3", url: "freehosting.com", amount: 480, cur: "TRY", cycle: "QUARTERLY", every: 1, startMonthsAgo: 9, group: hosting },
    { title: "Hetzner Cloud", url: "hetzner.com", amount: 12.5, cur: "EUR", cycle: "MONTHLY", every: 1, startMonthsAgo: 5, group: hosting },
    { title: "Figma Professional", url: "figma.com", amount: 45, cur: "USD", cycle: "MONTHLY", every: 1, startMonthsAgo: 7, group: media },
    { title: "Adobe Creative Cloud", url: "adobe.com", amount: 62, cur: "USD", cycle: "MONTHLY", every: 1, startMonthsAgo: 11, group: media },
    { title: "Notion Plus", url: "notion.so", amount: 10, cur: "USD", cycle: "MONTHLY", every: 1, startMonthsAgo: 4, group: prod },
    { title: "ChatGPT Plus", url: "openai.com", amount: 20, cur: "USD", cycle: "MONTHLY", every: 1, startMonthsAgo: 3, group: prod },
    { title: "JetBrains All Products", url: "jetbrains.com", amount: 289, cur: "USD", cycle: "YEARLY", every: 1, startMonthsAgo: 10, group: dev },
    { title: "Upwork Plus", url: "upwork.com", amount: 20, cur: "USD", cycle: "MONTHLY", every: 1, startMonthsAgo: 6, group: freelance },
    { title: "Cloudflare Pro", url: "cloudflare.com", amount: 20, cur: "USD", cycle: "MONTHLY", every: 1, startMonthsAgo: 12, group: hosting },
    { title: "Yandex 360 Business", url: "360.yandex.ru", amount: 600, cur: "RUB", cycle: "MONTHLY", every: 1, startMonthsAgo: 8, group: prod },
    { title: "Spotify Premium", url: "spotify.com", amount: 169, cur: "RUB", cycle: "MONTHLY", every: 1, startMonthsAgo: 9, group: media },
    { title: "Namecheap DNS", url: "namecheap.com", amount: 5, cur: "USD", cycle: "YEARLY", every: 1, startMonthsAgo: 2, group: hosting },
  ];

  for (const s of demoSubs) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - s.startMonthsAgo);
    const next = nextDate(startDate, s.cycle === "YEARLY" ? 12 : s.cycle === "QUARTERLY" ? 3 : 1);
    const sub = await prisma.subscription.create({
      data: {
        title: s.title,
        url: s.url,
        faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.url)}&sz=64`,
        amount: s.amount,
        currencyId: currencies[s.cur].id,
        billingCycle: s.cycle,
        billingEvery: s.every,
        startDate,
        nextPaymentDate: next,
        groups: { create: [{ groupId: s.group.id }] },
      },
    });
    void sub;
  }

  // ---- employees + salary payments ----
  const employees = await Promise.all([
    prisma.employee.create({ data: { name: "Алексей Иванов", position: "Backend-разработчик", contact: "alex@team.local" } }),
    prisma.employee.create({ data: { name: "Мария Петрова", position: "Frontend-разработчик", contact: "maria@team.local" } }),
    prisma.employee.create({ data: { name: "Дмитрий Сидоров", position: "DevOps", contact: "dmitry@team.local" } }),
  ]);

  // salaries: last 3 months for each employee
  const now = new Date();
  for (let m = 0; m < 3; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 5);
    const label = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    await prisma.salaryPayment.create({ data: { employeeId: employees[0].id, amount: 180000, currencyId: currencies.RUB.id, paidAt: d, periodLabel: `Оклад за ${label}` } });
    await prisma.salaryPayment.create({ data: { employeeId: employees[1].id, amount: 160000, currencyId: currencies.RUB.id, paidAt: d, periodLabel: `Оклад за ${label}` } });
    await prisma.salaryPayment.create({ data: { employeeId: employees[2].id, amount: 210000, currencyId: currencies.RUB.id, paidAt: d, periodLabel: `Оклад за ${label}` } });
    // bonus some months
    if (m === 1) {
      await prisma.salaryPayment.create({ data: { employeeId: employees[0].id, amount: 40000, currencyId: currencies.RUB.id, paidAt: new Date(d.getTime() + 10 * 86400000), periodLabel: `Премия за ${label}` } });
    }
  }

  console.log(`  ✓ ${demoSubs.length} subscriptions, ${groups.length} groups, ${employees.length} employees, 9 salary payments`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });