import { NextResponse } from "next/server";
import { resolveChatPersona } from "@/lib/i18n";
import { stubAgentReply } from "@/lib/chat/stub-reply";
import {
  getOllamaBaseUrl,
  isOllamaConfigured,
  replyWithOllama,
} from "@/lib/chat/ollama";

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

  let reply = stubAgentReply(persona, message);
  let source: "ollama" | "stub" = "stub";

  if (isOllamaConfigured()) {
    const model = process.env.OLLAMA_MODEL!.trim();
    const baseUrl = getOllamaBaseUrl();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 60_000);
    try {
      reply = await replyWithOllama({
        baseUrl,
        model,
        persona,
        userMessage: message,
        signal: controller.signal,
      });
      source = "ollama";
    } catch {
      reply = stubAgentReply(persona, message);
      source = "stub";
    } finally {
      clearTimeout(t);
    }
  }

  return NextResponse.json({ reply, persona, source });
}
