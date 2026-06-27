import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { toQrDataUrl } from "@/lib/qr";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = req.nextUrl.searchParams.get("text");
  if (!text) return new NextResponse("missing text", { status: 400 });
  const dataUrl = await toQrDataUrl(text);
  return new NextResponse(dataUrl, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}