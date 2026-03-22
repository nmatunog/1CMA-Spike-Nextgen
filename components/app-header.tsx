import Link from "next/link";

export function AppHeader() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1rem 1.25rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <Link
        href="/"
        style={{
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--text)",
          textDecoration: "none",
        }}
      >
        <span style={{ color: "var(--aia-red)" }}>1CMA</span> NextGen
      </Link>
      <nav style={{ display: "flex", gap: "1rem", fontSize: "0.9rem" }}>
        <Link href="/chat">Chat</Link>
        <Link href="/login">Sign in</Link>
      </nav>
    </header>
  );
}
