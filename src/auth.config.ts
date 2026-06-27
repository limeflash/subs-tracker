import type { NextAuthConfig } from "next-auth";

/**
 * Lightweight config shared with middleware.ts (Edge runtime).
 * MUST NOT import Prisma, argon2, or any Node-only module — middleware runs
 * in the Edge runtime where those are unavailable. Providers that need the
 * database live in src/auth.ts (Node runtime) and are merged at startup.
 */
export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login" },
  providers: [], // filled in src/auth.ts
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in `user` is the object returned by authorize().
      // Persist its id onto the token so session.user.id is populated.
      if (user) {
        token["id"] = (user as { id?: string }).id;
        token["email"] = (user as { email?: string }).email ?? token.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user["id"] = token["id"] as string;
        session.user["email"] = token["email"] as string;
      }
      return session;
    },
    authorized({ request, auth }) {
      const path = request.nextUrl.pathname;
      const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));
      const isGuestOnly = path === "/login" || path.startsWith("/login/");
      if (!auth && isProtected) return false; // -> redirect to signIn page
      if (auth && isGuestOnly && !path.startsWith("/api/")) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      return true;
    },
  },
  trustHost: true,
};

const PROTECTED = [
  "/dashboard", "/subscriptions", "/groups", "/employees", "/salaries",
  "/statistics", "/settings",
  "/api/subscriptions", "/api/groups", "/api/employees", "/api/salaries",
  "/api/currencies", "/api/telegram", "/api/exchange", "/api/favicon",
  "/api/settings", "/api/qr",
];