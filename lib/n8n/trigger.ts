export async function notifyN8n(
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        payload,
        at: new Date().toISOString(),
      }),
    });
  } catch {
    // Non-fatal: log server-side in production
  }
}
