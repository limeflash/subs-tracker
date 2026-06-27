-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecretCipher" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "backupCodesHash" TEXT[],
    "displayCurrencyId" TEXT,
    "telegramChatId" TEXT,
    "telegramBotTokenCipher" TEXT,
    "telegramNotifyUpcoming" BOOLEAN NOT NULL DEFAULT true,
    "telegramNotifyPaid" BOOLEAN NOT NULL DEFAULT true,
    "telegramNotifyPayroll" BOOLEAN NOT NULL DEFAULT true,
    "telegramNotifySummary" BOOLEAN NOT NULL DEFAULT true,
    "telegramNotifyDays" TEXT NOT NULL DEFAULT '1,3',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "overrideRateToBase" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "date" DATE NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "faviconUrl" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currencyId" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "billingEvery" INTEGER NOT NULL DEFAULT 1,
    "billingUnitDays" INTEGER,
    "nextPaymentDate" TIMESTAMP(3) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionGroup" (
    "subscriptionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "SubscriptionGroup_pkey" PRIMARY KEY ("subscriptionId","groupId")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "contact" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryPayment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currencyId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaviconCache" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "faviconUrl" TEXT NOT NULL,
    "contentType" TEXT,
    "blob" BYTEA,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaviconCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "meta" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_baseId_quoteId_date_key" ON "ExchangeRate"("baseId", "quoteId", "date");

-- CreateIndex
CREATE INDEX "Subscription_nextPaymentDate_idx" ON "Subscription"("nextPaymentDate");

-- CreateIndex
CREATE INDEX "Subscription_active_idx" ON "Subscription"("active");

-- CreateIndex
CREATE INDEX "SalaryPayment_paidAt_idx" ON "SalaryPayment"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "FaviconCache_domain_key" ON "FaviconCache"("domain");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_displayCurrencyId_fkey" FOREIGN KEY ("displayCurrencyId") REFERENCES "Currency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionGroup" ADD CONSTRAINT "SubscriptionGroup_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionGroup" ADD CONSTRAINT "SubscriptionGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

