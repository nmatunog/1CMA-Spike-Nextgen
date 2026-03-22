import { ChatPersona, type ChatPersonaId } from "./chat-persona";

/**
 * Province keys: lowercase slug — align with your onboarding dropdown values.
 * Refine with legal/comms; Bisaya list is intentionally narrow per product policy.
 */

/** Cebuano Conyo chat: Cebu + listed provinces + NW Mindanao bucket (editable). */
export const CHAT_CONYO_BISAYA_PROVINCES = new Set<string>([
  "cebu",
  "bohol",
  "siquijor",
  "southern_leyte",
  // North-western Mindanao (Zamboanga Peninsula — Cebuano-heavy; adjust if comms prefers EN)
  "zamboanga_del_norte",
  "zamboanga_del_sur",
  "zamboanga_sibugay",
  "zamboanga_city",
]);

/**
 * Taglish Conyo chat: Tagalog-primary service belts (editable).
 * Excludes Bisaya allowlist by definition in resolver (Bisaya wins if both matched — should not overlap).
 */
export const CHAT_TAGLISH_REGION_CODES = new Set<string>([
  "NCR",
  "III", // Central Luzon (broad Tagalog/Filipino metro usage in practice; refine per city if needed)
  "IV-A", // CALABARZON
]);

/** Optional finer control: province slugs that are explicitly Taglish-conyo chat. */
export const CHAT_TAGLISH_PROVINCES = new Set<string>([
  // Examples — extend to match your dropdown; empty means rely on region codes only
]);

export type ResolveChatPersonaInput = {
  /** ISO-like or PSA region code, e.g. NCR, IV-A */
  regionCode?: string | null;
  /** Normalized province slug, e.g. cebu, zamboanga_city */
  provinceSlug?: string | null;
  /** User override from settings: forces persona regardless of geo */
  userOverridePersona?: ChatPersonaId | null;
};

/**
 * Returns chat persona for agents only. Forms and formal layouts stay English in the UI layer.
 */
export function resolveChatPersona(input: ResolveChatPersonaInput): ChatPersonaId {
  if (input.userOverridePersona) {
    return input.userOverridePersona;
  }

  const province = input.provinceSlug?.trim().toLowerCase() ?? "";
  if (province && CHAT_CONYO_BISAYA_PROVINCES.has(province)) {
    return ChatPersona.ConyoBisaya;
  }

  if (province && CHAT_TAGLISH_PROVINCES.has(province)) {
    return ChatPersona.TaglishConyo;
  }

  const region = input.regionCode?.trim().toUpperCase() ?? "";
  if (region && CHAT_TAGLISH_REGION_CODES.has(region)) {
    return ChatPersona.TaglishConyo;
  }

  return ChatPersona.PeerEn;
}
