"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (res?.error) {
      setErr("Invalid credentials or demo login not configured.");
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <AppHeader />
      <main
        style={{
          padding: "2rem 1.25rem",
          maxWidth: 400,
          margin: "0 auto",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Sign in</h1>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Demo credentials come from <code>.env</code> (
          <code>DEMO_USER_EMAIL</code> / <code>DEMO_USER_PASSWORD</code>).
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: "1rem" }}>
          <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.85rem" }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={field}
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.85rem" }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={field}
            />
          </label>
          {err && (
            <p style={{ color: "var(--aia-red)", margin: 0, fontSize: "0.9rem" }}>{err}</p>
          )}
          <button type="submit" style={btn}>
            Sign in
          </button>
        </form>
      </main>
    </>
  );
}

const field: React.CSSProperties = {
  padding: "0.65rem 0.75rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontSize: "1rem",
};

const btn: React.CSSProperties = {
  padding: "0.75rem",
  borderRadius: 8,
  border: "none",
  background: "var(--aia-red)",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
