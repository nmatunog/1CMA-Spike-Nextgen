import { getPersonaSystemPrompt } from "./persona-system-prompts";
import type { ChatPersonaId } from "@/lib/i18n/chat-persona";

type OllamaChatResponse = {
  message?: { content?: string };
  error?: string;
};

export async function replyWithOllama(params: {
  baseUrl: string;
  model: string;
  persona: ChatPersonaId;
  userMessage: string;
  signal?: AbortSignal;
}): Promise<string> {
  const system = getPersonaSystemPrompt(params.persona);
  const url = `${params.baseUrl.replace(/\/$/, "")}/api/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: params.signal,
    body: JSON.stringify({
      model: params.model,
      stream: false,
      options: { temperature: 0.35, num_predict: 512 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: params.userMessage || "Hello" },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as OllamaChatResponse;
  const content = data.message?.content?.trim();
  if (!content) {
    throw new Error(data.error || "Empty Ollama response");
  }
  return content;
}

export function isOllamaConfigured(): boolean {
  return Boolean(process.env.OLLAMA_MODEL?.trim());
}

export function getOllamaBaseUrl(): string {
  return (
    process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434"
  );
}
