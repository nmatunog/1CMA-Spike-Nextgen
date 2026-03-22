import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { resolveChatPersona } from "@/lib/i18n";
import { notifyN8n } from "@/lib/n8n/trigger";
import { enqueueSocialEvent } from "@/lib/social/automation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    regionCode?: string;
    provinceSlug?: string;
    email?: string | null;
  };
  const regionCode = body.regionCode?.trim() ?? "";
  const provinceSlug = body.provinceSlug?.trim() ?? "";
  if (!regionCode || !provinceSlug) {
    return NextResponse.json(
      { error: "regionCode and provinceSlug are required" },
      { status: 400 },
    );
  }

  const session = await auth();
  const persona = resolveChatPersona({ regionCode, provinceSlug });
  const db = getDb();
  const id = crypto.randomUUID();

  await db.insert(leads).values({
    id,
    createdAt: new Date(),
    regionCode,
    provinceSlug,
    resolvedPersona: persona,
    email: body.email?.trim() || null,
    userId: session?.user?.id ?? null,
  });

  await notifyN8n("lead.created", {
    id,
    regionCode,
    provinceSlug,
    persona,
    userId: session?.user?.id ?? null,
  });
  await enqueueSocialEvent("lead_registered", { regionCode, provinceSlug });

  return NextResponse.json({ ok: true, id, persona });
}
