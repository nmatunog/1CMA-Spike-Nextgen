import type { ChatPersonaId } from "@/lib/i18n/chat-persona";

/** Simulated agent lines (chat layer only — forms stay English). */
export function stubAgentReply(
  persona: ChatPersonaId,
  userMessage: string,
): string {
  const clip = userMessage.trim().slice(0, 280);
  switch (persona) {
    case "conyo_bisaya":
      return `Oy, musta! I'm your peer guide for 1CMA. Re: "${clip || "…"}" — unsay gusto nimo i-explore unya? (This chat uses a Cebuano-mix tone for your area; formal stuff stays in English above.)`;
    case "taglish_conyo":
      return `Uy, got you! Re: "${clip || "…"}" — I can walk you through next steps, no pressure. (Taglish peer tone for chat only.)`;
    default:
      return `Hey — I'm here to help with 1CMA next steps. You said: "${clip || "…"}" — want a quick rundown or to jump to the form?`;
  }
}
