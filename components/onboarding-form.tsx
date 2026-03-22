"use client";

import { useMemo, useState } from "react";
import { REGIONS, getProvincesForRegion } from "@/data/geo";
import {
  writeOnboardingToStorage,
  type StoredOnboarding,
} from "@/lib/storage/onboarding";
import Link from "next/link";

export function OnboardingForm({
  initial,
}: {
  initial?: StoredOnboarding | null;
}) {
  const [regionCode, setRegionCode] = useState(
    initial?.regionCode ?? REGIONS[0]?.code ?? "",
  );
  const provinces = useMemo(
    () => getProvincesForRegion(regionCode),
    [regionCode],
  );
  const [provinceSlug, setProvinceSlug] = useState(
    initial?.provinceSlug ?? provinces[0]?.slug ?? "",
  );

  const handleRegion = (code: string) => {
    setRegionCode(code);
    const next = getProvincesForRegion(code);
    setProvinceSlug(next[0]?.slug ?? "");
  };

  const save = () => {
    if (!regionCode || !provinceSlug) return;
    writeOnboardingToStorage({ regionCode, provinceSlug });
  };

  return (
    <section
      id="location"
      style={{
        maxWidth: 480,
        padding: "1.5rem",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
      }}
    >
      <h1
        style={{
          margin: "0 0 0.5rem",
          fontSize: "1.5rem",
          letterSpacing: "-0.03em",
        }}
      >
        Your location
      </h1>
      <p style={{ margin: "0 0 1.25rem", color: "var(--muted)", fontSize: "0.95rem" }}>
        All form labels are in English. Region and province stay in your browser
        for chat tone only — not for legal or contract wording.
      </p>
      <label
        style={{ display: "block", marginBottom: "1rem", fontSize: "0.85rem" }}
      >
        <span style={{ display: "block", marginBottom: "0.35rem", color: "var(--muted)" }}>
          Region
        </span>
        <select
          value={regionCode}
          onChange={(e) => handleRegion(e.target.value)}
          style={selectStyle}
        >
          {REGIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "block", marginBottom: "1.25rem", fontSize: "0.85rem" }}>
        <span style={{ display: "block", marginBottom: "0.35rem", color: "var(--muted)" }}>
          Province / key area
        </span>
        <select
          value={provinceSlug}
          onChange={(e) => setProvinceSlug(e.target.value)}
          disabled={provinces.length === 0}
          style={selectStyle}
        >
          {provinces.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        <button type="button" onClick={save} style={primaryBtn}>
          Save &amp; continue
        </button>
        <Link href="/chat" style={{ ...linkBtn, textDecoration: "none" }}>
          Open chat
        </Link>
      </div>
    </section>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.75rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "1rem",
};

const primaryBtn: React.CSSProperties = {
  padding: "0.65rem 1rem",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, var(--aia-red), #9a0d33)",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.65rem 1rem",
  borderRadius: 8,
  border: "1px solid var(--aia-cyan)",
  color: "var(--aia-cyan)",
  fontWeight: 600,
};
