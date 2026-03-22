import { NextResponse } from "next/server";

export const runtime = "nodejs";

const COOKIE = "admin_verified";

export async function POST(req: Request) {
  const secret = process.env.ADMIN_CONSOLE_PASSWORD?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Admin access not configured" },
      { status: 503 },
    );
  }
  const body = (await req.json()) as { password?: string };
  if (body.password !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
