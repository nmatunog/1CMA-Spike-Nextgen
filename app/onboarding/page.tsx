import Link from "next/link";
import { OnboardingForm } from "@/components/onboarding-form";
import { AppHeader } from "@/components/app-header";

export default function OnboardingPage() {
  return (
    <>
      <AppHeader />
      <main
        style={{
          padding: "2rem 1.25rem 4rem",
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        <p
          style={{
            color: "var(--aia-cyan)",
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            margin: "0 0 0.75rem",
          }}
        >
          Recruitment · Gen Z first
        </p>
        <p style={{ margin: "0 0 1.5rem", color: "var(--muted)", fontSize: "0.95rem" }}>
          <Link href="/" style={{ color: "var(--aia-cyan)" }}>
            ← Back to landing
          </Link>
        </p>
        <section
          style={{
            marginBottom: "2.5rem",
            paddingBottom: "2rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h1
            style={{
              margin: "0 0 0.75rem",
              fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
              letterSpacing: "-0.04em",
              lineHeight: 1.15,
            }}
          >
            Region &amp; chat setup —{" "}
            <span style={{ color: "var(--aia-red)" }}>English-first</span> forms
          </h1>
          <p
            style={{
              margin: "0 0 1.25rem",
              color: "var(--muted)",
              fontSize: "1.05rem",
              maxWidth: 52 * 16,
            }}
          >
            Save your region for chat tone, then open peer chat when you&apos;re ready.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            <Link
              href="#location"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.7rem 1.1rem",
                borderRadius: 10,
                background: "linear-gradient(135deg, var(--aia-red), #9a0d33)",
                color: "#fff",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Set location
            </Link>
            <Link
              href="/chat"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.7rem 1.1rem",
                borderRadius: 10,
                border: "1px solid var(--aia-cyan)",
                color: "var(--aia-cyan)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Open chat
            </Link>
          </div>
        </section>
        <OnboardingForm />
      </main>
    </>
  );
}
