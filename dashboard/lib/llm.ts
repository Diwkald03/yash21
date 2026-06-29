import Anthropic from "@anthropic-ai/sdk";

// Unified LLM caller with a PROVIDER FALLBACK CHAIN:
//   primary OpenAI-compatible (LLM_*)  →  secondary OpenAI-compatible (LLM_*_2)  →  Claude  →  throw.
// So a rate-limited / down primary (e.g. a throttled Gemini key) automatically falls through
// to the next free provider (e.g. Groq) instead of silently dropping to the weak local heuristic.
// Configure: LLM_API_KEY/LLM_BASE_URL/LLM_MODEL (primary), LLM_API_KEY_2/LLM_BASE_URL_2/LLM_MODEL_2 (fallback).

export type LlmKind = "analysis" | "blog";

interface OAProvider { key: string; base: string; model: string; name: string }

export function providerName(base: string): string {
  const b = (base || "").toLowerCase();
  if (b.includes("groq")) return "groq";
  if (b.includes("generativelanguage") || b.includes("googleapis")) return "gemini";
  if (b.includes("openrouter")) return "openrouter";
  if (b.includes("mistral")) return "mistral";
  return "openai";
}

function pickModel(kind: LlmKind, model?: string, analysisModel?: string, blogModel?: string): string {
  return (kind === "blog" ? blogModel || model : analysisModel || model) || "llama-3.3-70b-versatile";
}

// Ordered providers to try (primary first, then the fallback).
function openAiProviders(kind: LlmKind): OAProvider[] {
  const E = process.env;
  const out: OAProvider[] = [];
  if (E.LLM_API_KEY && E.LLM_BASE_URL) {
    out.push({
      key: E.LLM_API_KEY, base: E.LLM_BASE_URL,
      model: pickModel(kind, E.LLM_MODEL, E.LLM_ANALYSIS_MODEL, E.LLM_BLOG_MODEL),
      name: providerName(E.LLM_BASE_URL),
    });
  }
  if (E.LLM_API_KEY_2 && E.LLM_BASE_URL_2) {
    out.push({
      key: E.LLM_API_KEY_2, base: E.LLM_BASE_URL_2,
      model: pickModel(kind, E.LLM_MODEL_2, E.LLM_ANALYSIS_MODEL_2, E.LLM_BLOG_MODEL_2),
      name: providerName(E.LLM_BASE_URL_2),
    });
  }
  return out;
}

/** Which engine will actually be used, based on env. "none" = local fallback. */
export function activeEngine(): "openai" | "claude" | "none" {
  if ((process.env.LLM_API_KEY && process.env.LLM_BASE_URL) ||
      (process.env.LLM_API_KEY_2 && process.env.LLM_BASE_URL_2)) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return "none";
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 529]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Call one OpenAI-compatible provider. A couple of quick retries for transient errors,
// then give up so llmComplete can fall through to the NEXT provider in the chain.
async function callOpenAI(p: OAProvider, system: string, user: string, maxTokens: number, kind: LlmKind): Promise<string> {
  const url = `${p.base.replace(/\/+$/, "")}/chat/completions`;
  const payload = JSON.stringify({
    model: p.model,
    max_tokens: maxTokens,
    temperature: kind === "blog" ? 0.7 : 0.3,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  // Ride out transient overload (esp. free Gemini's 503 "high demand") with a few backed-off
  // retries before falling through to the next provider — keeps the product sweep on the
  // high-TPM provider instead of dropping to the weak fallback (which caused fluctuating results).
  const delays = [0, 800, 1800, 3500];
  let lastErr = "provider failed";
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await sleep(delays[attempt]);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: payload,
      });
    } catch (e) { lastErr = e instanceof Error ? e.message : "network error"; continue; }
    let data: unknown = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (res.ok) {
      const text: string = (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content || "";
      if (text.trim()) return text;
      lastErr = "empty response"; continue; // e.g. 3.x thinking ate the budget — retry once
    }
    lastErr = (data as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`;
    if (!RETRYABLE.has(res.status)) break; // 400/401/403 — not worth retrying this provider
  }
  throw new Error(lastErr);
}

/** Returns the model text plus the engine label that produced it. Throws only if EVERY provider fails. */
export async function llmComplete(opts: {
  system: string;
  user: string;
  maxTokens: number;
  kind: LlmKind;
}): Promise<{ text: string; engine: string }> {
  const { system, user, maxTokens, kind } = opts;

  // 1) OpenAI-compatible chain (primary → fallback)
  const chain = openAiProviders(kind);
  let lastErr = "No LLM provider configured";
  for (const p of chain) {
    try {
      const text = await callOpenAI(p, system, user, maxTokens, kind);
      return { text, engine: p.name };
    } catch (e) {
      lastErr = `${p.name}: ${e instanceof Error ? e.message : "error"}`;
      // fall through to the next provider in the chain
    }
  }

  // 2) Anthropic Claude (paid) — last resort before the local heuristic
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    const client = new Anthropic({ apiKey: key });
    const model =
      kind === "blog"
        ? process.env.BLOG_MODEL || "claude-opus-4-8"
        : process.env.ANALYSIS_MODEL || "claude-sonnet-4-6";
    const resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = resp.content.find((b) => b.type === "text");
    const text = block && "text" in block ? block.text : "";
    if (!text.trim()) throw new Error("Empty response from Claude");
    return { text, engine: "claude" };
  }

  throw new Error(lastErr);
}
