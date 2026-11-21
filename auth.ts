import { memberService } from '@/lib/member/runtime';
import { authorizeMember } from '@/lib/member/authorize';
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyStaff } from "@/lib/gia/staff-credentials.mjs";

const DEV_AUTH_SECRET =
  "dev-only-auth-secret-min-32-chars-set-auth-secret-in-env-local";

const BUILD_PLACEHOLDER_SECRET =
  "build-placeholder-prod-requires-env-auth-secret-min-32!!";

/**
 * Auth.js / @auth/core infer secrets from `process.env.AUTH_SECRET` in some paths.
 * Ensure the env var is always set so `assertConfig` never sees a missing secret.
 */
function ensureAuthSecretInEnv(): string {
  const fromEnv =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (fromEnv) {
    process.env.AUTH_SECRET = fromEnv;
    return fromEnv;
  }
  if (process.env.NODE_ENV === "development") {
    process.env.AUTH_SECRET = DEV_AUTH_SECRET;
    return DEV_AUTH_SECRET;
  }
  process.env.AUTH_SECRET = BUILD_PLACEHOLDER_SECRET;
  return BUILD_PLACEHOLDER_SECRET;
}

const secret = ensureAuthSecretInEnv();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret,
  trustHost: true,
  providers: [
    Credentials({
      id: 'member',
      credentials: { email: { type: 'email' }, password: { type: 'password' } },
      authorize: authorizeMember,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const staff = verifyStaff(credentials?.email, credentials?.password, process.env.RECRUITMENT_STAFF_ACCOUNTS);
        if (staff) return staff;
        const email = process.env.DEMO_USER_EMAIL;
        const password = process.env.DEMO_USER_PASSWORD;
        if (!email || !password) return null;
        if (
          credentials?.email === email &&
          credentials?.password === password
        ) {
          return { id: "demo", name: "Demo Explorer", email };
        }
        return null;
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id?.startsWith('member:')) token.memberVersion = (user as { authVersion?: number }).authVersion;
      if (token.sub?.startsWith('member:')) {
        try { if (!await (await memberService()).session(token.sub.slice(7), Number(token.memberVersion))) return null; } catch { return null; }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        if (token.sub?.startsWith('member:')) (session.user as typeof session.user & { authVersion?: number }).authVersion = Number(token.memberVersion);
      }
      return session;
    },
  },
});
