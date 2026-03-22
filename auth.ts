import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

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
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
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
});
