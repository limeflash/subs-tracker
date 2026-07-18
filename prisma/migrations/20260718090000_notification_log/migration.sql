-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_kind_refKey_day_key" ON "NotificationLog"("kind", "refKey", "day");

-- CreateIndex
CREATE INDEX "NotificationLog_day_idx" ON "NotificationLog"("day");
