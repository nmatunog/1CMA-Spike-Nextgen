import { NextResponse } from "next/server";

/** Inbound hook for n8n (or other orchestrators) — verify in production. */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.N8N_INBOUND_SECRET;
  if (secret) {
    const token = req.headers.get("x-n8n-secret");
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  await req.json().catch(() => ({}));
  return NextResponse.json({ ok: true, received: new Date().toISOString() });
}
