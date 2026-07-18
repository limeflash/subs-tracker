-- AlterTable
ALTER TABLE "User" ADD COLUMN "aiApiKeyCipher" TEXT,
ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT 'qwen3.5:122b';
