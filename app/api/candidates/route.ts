import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { candidates } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(req: Request) {
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
      .insert(candidates)
      .values({ name, email, phone, score })
      .returning({ id: candidates.id });
    return NextResponse.json({ ok: true, id: row?.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
