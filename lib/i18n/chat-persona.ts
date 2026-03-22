/**
 * Chat-only personas for simulated reps/agents.
 * Formal UI (forms, nav, legal) must remain English — see resolveChatPersona usage in chat layer only.
 */
export const ChatPersona = {
  /** Friendly peer English; safe default when geo unknown or ambiguous */
  PeerEn: "peer_en",
  /** Tagalog–English conyo (chat tone only) */
  TaglishConyo: "taglish_conyo",
  /** Cebuano–English conyo (chat tone only); restricted geography */
  ConyoBisaya: "conyo_bisaya",
} as const;

export type ChatPersonaId = (typeof ChatPersona)[keyof typeof ChatPersona];
