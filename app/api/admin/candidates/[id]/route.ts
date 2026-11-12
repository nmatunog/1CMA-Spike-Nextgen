import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { staff } from "@/lib/gia/staff";
import { getDb } from "@/lib/db/client";
import { landingQuizResults } from "@/lib/db/schema";
import { sameOrigin } from "@/lib/gia/origin";

export const runtime = "nodejs";

async function assertAdmin() {
  return (await staff())?.role === "admin";
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const db = getDb();
    const deleted = await db
      .delete(landingQuizResults)
      .where(eq(landingQuizResults.id, id))
      .returning({ id: landingQuizResults.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    const message = "Service unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
