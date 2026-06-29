import { NextRequest, NextResponse } from "next/server";
import { llmComplete, activeEngine } from "@/lib/llm";
import { fixTerms, BRAND_GLOSSARY } from "@/lib/terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You clean raw auto-generated YouTube captions into a readable transcript.
Fix spelling, capitalization, and punctuation, and add natural paragraph breaks.
Keep the ORIGINAL language exactly (Hindi stays Hindi, Hinglish stays Hinglish — do NOT translate).
Preserve the meaning and all content — do not summarize, add, or remove information.
Spell these brand names correctly wherever the captions mangled them: ${BRAND_GLOSSARY}.
(e.g. auto-captions write "Du डब" for DeoDap and "MSHO" for Meesho — correct such cases.)
Output ONLY the cleaned transcript text, with no preamble or commentary.`;

export async function POST(req: NextRequest) {
  let transcript = "";
  try {
    transcript = String((await req.json())?.transcript || "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!transcript.trim()) return NextResponse.json({ error: "transcript required" }, { status: 400 });

  // No model → still apply the deterministic brand fixes so it's better than raw
  if (activeEngine() === "none") {
    return NextResponse.json({ cleaned: fixTerms(transcript), engine: "local" });
  }

  try {
    const { text, engine } = await llmComplete({
      system: SYSTEM,
      user: `Clean up this raw transcript:\n\n${transcript.slice(0, 30000)}`,
      maxTokens: 8000,
      kind: "blog",
    });
    // belt-and-suspenders: deterministic brand fixes on top of the AI output
    return NextResponse.json({ cleaned: fixTerms(text.trim() || transcript), engine });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ cleaned: fixTerms(transcript), engine: "error", error: message });
  }
}
