import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { staff } from "@/lib/gia/staff";
import { getDb } from "@/lib/db/client";
import { landingQuizResults } from "@/lib/db/schema";

export const runtime = "nodejs";

async function assertAdmin() {
  return (await staff())?.role === "admin";
}

/** DNA-quiz admin list. Isolated from recruitment Command Center candidates. */
export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(landingQuizResults)
      .orderBy(desc(landingQuizResults.score));
    return NextResponse.json({
      candidates: rows.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        score: c.score,
        created_at:
          c.createdAt instanceof Date
            ? c.createdAt.toISOString()
            : String(c.createdAt),
      })),
    });
  } catch {
    const message = "Service unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
