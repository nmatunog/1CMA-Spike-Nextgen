import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const COOKIE = "admin_verified";

async function assertAdmin() {
  const jar = await cookies();
  return jar.get(COOKIE)?.value === "1";
}

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const key = service || anon;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .order("score", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ candidates: data ?? [] });
}
