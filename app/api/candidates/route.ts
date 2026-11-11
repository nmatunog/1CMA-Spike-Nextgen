import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { landingQuizResults } from "@/lib/db/schema";
import { sameOrigin } from "@/lib/gia/origin";

export const runtime = "nodejs";

/**
 * Public DNA-quiz intake (LandingExperience). Isolated from canonical
 * recruitment `candidates` so Command Center / GIA never treat a quiz POST as
 * a consented recruit. Consent is never inferred. Origin-checked. Same
 * `{ ok, id }` contract as before so the landing quiz still saves.
 * Promotion into Command Center is CC-02b (CSV / verified identity).
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  const body = (await req.json()) as {
    name?: string;
    email?: string;
    phone?: string;
    score?: number;
  };
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const score = typeof body.score === "number" ? Math.round(body.score) : NaN;
  if (!name || !email || !phone || Number.isNaN(score)) {
    return NextResponse.json(
      { error: "name, email, phone, and score are required" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const [row] = await db
      .insert(landingQuizResults)
      .values({ name, email, phone, score })
      .returning({ id: landingQuizResults.id });
    return NextResponse.json({ ok: true, id: row?.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
