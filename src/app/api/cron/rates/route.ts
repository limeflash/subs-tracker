import { NextResponse, type NextRequest } from "next/server";
import { fetchAndStoreRates } from "@/lib/fetch-rates";
import { safeSecretEqual } from "@/lib/crypto";

// Trigger: host cron / docker scheduler -> curl -H "x-cron-secret: $CRON_SECRET" https://your-domain.example/api/cron/rates
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || !secret || !safeSecretEqual(secret, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const res = await fetchAndStoreRates();
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}