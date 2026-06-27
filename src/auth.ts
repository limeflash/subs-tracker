import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { consumeTwoFactorOkCookie } from "@/lib/cookies";

/**
 * Auth.js v5 — Node runtime config. Extends the lightweight authConfig
 * (shared with middleware / Edge) with the Credentials provider that needs
 * Prisma + argon2 (Node-only).
 *
 * 2FA flow: password is verified out-of-band (loginStep1 server action).
 * When 2FA is enabled, a signed pre-auth cookie leads to /login/2fa, which
 * verifies the TOTP and sets a one-shot 2FA-ok cookie. The provider REQUIRES
 * that cookie for accounts with 2FA — without coupling it in, a bypass would
 * be possible. The "__2fa__" sentinel lets loginStep2 skip re-hashing the
 * password once 2FA has cleared.
 */
export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        if (password === "__2fa__") {
          if (!user.twoFactorEnabled) return null;
          const cleared = await consumeTwoFactorOkCookie(email);
          return cleared ? { id: user.id, email: user.email } : null;
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        if (user.twoFactorEnabled) {
          const cleared = await consumeTwoFactorOkCookie(email);
          if (!cleared) return null;
        }

        return { id: user.id, email: user.email };
      },
    }),
  ],
});