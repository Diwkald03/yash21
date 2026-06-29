import { NextRequest, NextResponse } from "next/server";
import { llmComplete, activeEngine } from "@/lib/llm";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You are a friendly, helpful assistant answering questions about a DeoDap YouTube video,
grounded ONLY in the provided transcript. The transcript is Hindi/Hinglish; reply in clear, simple English
(use a little Hinglish only if the user does). Be concise and specific. If the answer is not in the
transcript, say so plainly instead of guessing.`;

export async function POST(req: NextRequest) {
  let transcript = "";
  let question = "";
  let history: ChatMessage[] = [];
  try {
    const body = await req.json();
    transcript = String(body?.transcript || "");
    question = String(body?.question || "");
    history = Array.isArray(body?.history) ? body.history : [];
  } catch {
    return NextResponse.json({ answer: "Invalid request.", engine: "error" }, { status: 400 });
  }
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

  // No model configured → friendly local message (never crash)
  if (activeEngine() === "none") {
    return NextResponse.json({
      answer:
        "AI chat needs a model key. Add a free Groq key (LLM_API_KEY) in dashboard/.env.local to chat about this video. The pipeline (analyze → blog → SEO) still works offline.",
      engine: "local",
    });
  }

  try {
    const priorTurns = (history || [])
      .slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
      .join("\n");
    const user =
      `Video transcript (Hindi/Hinglish):\n"""\n${transcript.slice(0, 40000)}\n"""\n\n` +
      (priorTurns ? `Conversation so far:\n${priorTurns}\n\n` : "") +
      `Question: ${question}\n\nAnswer using only the transcript above.`;
    const { text, engine } = await llmComplete({ system: SYSTEM, user, maxTokens: 1024, kind: "analysis" });
    return NextResponse.json({ answer: text.trim() || "(no answer)", engine });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ answer: `Chat error: ${message}`, engine: "error" });
  }
}
