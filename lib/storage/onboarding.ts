export const ONBOARDING_KEY = "cma_onboarding_v1";
/** One-time server lead sync after onboarding (avoids duplicate rows on every save). */
export const LEAD_SYNCED_KEY = "cma_lead_synced_v1";

export type StoredOnboarding = {
  regionCode: string;
  provinceSlug: string;
  savedAt: number;
};

const COOKIE = "cma_onboarding";

export function readOnboardingFromStorage(): StoredOnboarding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOnboarding;
    if (!parsed.regionCode || !parsed.provinceSlug) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOnboardingToStorage(data: Omit<StoredOnboarding, "savedAt">) {
  const payload: StoredOnboarding = {
    ...data,
    savedAt: Date.now(),
  };
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(payload));
  const enc = encodeURIComponent(JSON.stringify(payload));
  document.cookie = `${COOKIE}=${enc}; path=/; max-age=31536000; SameSite=Lax`;
}

export function markLeadSynced() {
  localStorage.setItem(LEAD_SYNCED_KEY, "1");
}

export function hasLeadSynced(): boolean {
  return localStorage.getItem(LEAD_SYNCED_KEY) === "1";
}
