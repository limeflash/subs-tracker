import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe auth for middleware — does NOT import Prisma/argon2.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Skip Next internals, auth callback, and cron endpoints (auth-independent).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|api/cron).*)"],
};