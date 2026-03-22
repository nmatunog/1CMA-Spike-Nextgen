/**
 * Placeholder hooks for social automation (Meta Graph, schedulers, etc.).
 * Forward events to n8n so workflows stay in one place.
 */
export async function enqueueSocialEvent(
  kind: string,
  meta: Record<string, unknown>,
): Promise<void> {
  const url =
    process.env.N8N_SOCIAL_WEBHOOK_URL ?? process.env.N8N_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "social_automation",
        kind,
        meta,
        at: new Date().toISOString(),
      }),
    });
  } catch {
    /* ignore */
  }
}
