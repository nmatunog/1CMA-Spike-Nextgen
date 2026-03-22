import { NextResponse } from "next/server";
import { resolveChatPersona } from "@/lib/i18n";
import { stubAgentReply } from "@/lib/chat/stub-reply";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    message?: string;
    regionCode?: string;
    provinceSlug?: string;
  };
  const message = typeof body.message === "string" ? body.message : "";
  const regionCode = body.regionCode ?? "";
  const provinceSlug = body.provinceSlug ?? "";
  const persona = resolveChatPersona({ regionCode, provinceSlug });
  const reply = stubAgentReply(persona, message);
  return NextResponse.json({ reply, persona });
}
