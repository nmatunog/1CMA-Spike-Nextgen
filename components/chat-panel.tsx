"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  readOnboardingFromStorage,
  hasLeadSynced,
  markLeadSynced,
  type StoredOnboarding,
} from "@/lib/storage/onboarding";
import type { ChatPersonaId } from "@/lib/i18n/chat-persona";

export function ChatPanel() {
  const router = useRouter();
  const [onboarding, setOnboarding] = useState<StoredOnboarding | null>(null);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<{ role: "user" | "agent"; text: string }[]>(
    [],
  );
  const [persona, setPersona] = useState<ChatPersonaId | null>(null);
  const [replySource, setReplySource] = useState<"ollama" | "stub" | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const o = readOnboardingFromStorage();
    if (!o) {
      router.replace("/");
      return;
    }
    setOnboarding(o);
  }, [router]);

  useEffect(() => {
    if (!onboarding || hasLeadSynced()) return;
    void fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regionCode: onboarding.regionCode,
        provinceSlug: onboarding.provinceSlug,
      }),
    })
      .then((r) => {
        if (r.ok) markLeadSynced();
      })
      .catch(() => {});
  }, [onboarding]);

  const send = async () => {
    if (!onboarding || !input.trim()) return;
    const userText = input.trim();
    setInput("");
    setLines((prev) => [...prev, { role: "user", text: userText }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          regionCode: onboarding.regionCode,
          provinceSlug: onboarding.provinceSlug,
        }),
      });
      const data = (await res.json()) as {
        reply: string;
        persona: ChatPersonaId;
        source?: "ollama" | "stub";
      };
      setPersona(data.persona);
      setReplySource(data.source ?? null);
      setLines((prev) => [...prev, { role: "agent", text: data.reply }]);
    } finally {
      setLoading(false);
    }
  };

  if (!onboarding) {
    return (
      <p style={{ color: "var(--muted)" }}>Loading…</p>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        maxWidth: 560,
        minHeight: 360,
      }}
    >
      <div
        style={{
          fontSize: "0.8rem",
          color: "var(--muted)",
        }}
      >
        Peer chat · persona:{" "}
        <span style={{ color: "var(--aia-cyan)" }}>{persona ?? "…"}</span>
        {replySource ? (
          <>
            {" "}
            · source:{" "}
            <span style={{ color: "var(--aia-purple)" }}>{replySource}</span>
          </>
        ) : null}
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {lines.length === 0 && (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.95rem" }}>
            Say hi — this is a stub agent using your saved region for tone.
          </p>
        )}
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              alignSelf: l.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "92%",
              padding: "0.6rem 0.85rem",
              borderRadius: 10,
              background:
                l.role === "user"
                  ? "rgba(0, 169, 206, 0.12)"
                  : "var(--surface)",
              border:
                l.role === "user"
                  ? "1px solid rgba(0, 169, 206, 0.35)"
                  : "1px solid var(--border)",
              fontSize: "0.95rem",
              whiteSpace: "pre-wrap",
            }}
          >
            {l.text}
          </div>
        ))}
        {loading && (
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            Typing…
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message…"
          style={{
            flex: 1,
            padding: "0.65rem 0.85rem",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: "1rem",
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={loading}
          style={{
            padding: "0.65rem 1rem",
            borderRadius: 8,
            border: "none",
            background: "var(--aia-purple)",
            color: "#fff",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
