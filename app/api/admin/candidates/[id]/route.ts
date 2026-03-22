import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { candidates } from "@/lib/db/schema";

export const runtime = "nodejs";

const COOKIE = "admin_verified";

async function assertAdmin() {
  const jar = await cookies();
  return jar.get(COOKIE)?.value === "1";
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const db = getDb();
    const deleted = await db
      .delete(candidates)
      .where(eq(candidates.id, id))
      .returning({ id: candidates.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
