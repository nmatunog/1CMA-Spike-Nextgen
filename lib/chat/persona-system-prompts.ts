import type { ChatPersonaId } from "@/lib/i18n/chat-persona";

/** System prompts for optional LLM (Ollama). Keep short; no legal/financial claims. */
export function getPersonaSystemPrompt(persona: ChatPersonaId): string {
  const base =
    "You are a friendly peer mentor for 1CMA recruitment exploration. " +
    "Do not give legal, tax, or guaranteed income advice. " +
    "If unsure, suggest speaking with a licensed advisor. " +
    "Keep replies concise (under 120 words).";

  switch (persona) {
    case "conyo_bisaya":
      return (
        base +
        " Use a warm mix of English and Cebuano conversational phrases (Conyo Bisaya style) suitable for chat. " +
        "Formal application text elsewhere stays English — this is chat only."
      );
    case "taglish_conyo":
      return (
        base +
        " Use a warm Tagalog–English conversational mix (Taglish) suitable for chat. " +
        "Stay helpful and upbeat."
      );
    default:
      return base + " Use clear, friendly English.";
  }
}
