import { NextResponse } from "next/server";
import { shopifyConfigured } from "@/lib/shopify";
import { storeBackend } from "@/lib/store";
import { activeEngine } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Friendly provider name derived from the configured base URL (for the UI chip).
function providerLabel(engine: string): string {
  const base = (process.env.LLM_BASE_URL || "").toLowerCase();
  if (base.includes("googleapis") || base.includes("generativelanguage")) return "Gemini";
  if (base.includes("groq")) return "Groq";
  if (base.includes("openrouter")) return "OpenRouter";
  if (base.includes("mistral")) return "Mistral";
  if (engine === "openai") return "Free LLM";
  if (engine === "claude") return "Claude";
  return "Local AI";
}

export async function GET() {
  const engine = activeEngine(); // "openai" | "claude" | "none"
  const usingFree = engine === "openai";
  const freeModel = process.env.LLM_MODEL || "llama-3.3-70b-versatile";
  return NextResponse.json({
    claude: engine !== "none", // header chip: any AI engine ready
    engine,
    provider: providerLabel(engine), // "Gemini" | "Groq" | "Claude" | ...
    shopify: shopifyConfigured(),
    db: storeBackend, // "postgres" | "file"
    analysisModel: usingFree
      ? process.env.LLM_ANALYSIS_MODEL || freeModel
      : process.env.ANALYSIS_MODEL || "claude-sonnet-4-6",
    blogModel: usingFree
      ? process.env.LLM_BLOG_MODEL || freeModel
      : process.env.BLOG_MODEL || "claude-opus-4-8",
  });
}
