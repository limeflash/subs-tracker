import { NextResponse, type NextRequest } from "next/server";
import { runNotifications } from "@/lib/notify";
import { safeSecretEqual } from "@/lib/crypto";

// Trigger: host cron daily ~09:00 -> curl -H "x-cron-secret: $CRON_SECRET" https://your-domain.example/api/cron/notify
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || !secret || !safeSecretEqual(secret, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const res = await runNotifications();
  return NextResponse.json(res);
}