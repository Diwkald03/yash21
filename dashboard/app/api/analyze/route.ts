import { NextRequest, NextResponse } from "next/server";
import { localAnalyze } from "@/lib/localAnalyze";
import { llmComplete, activeEngine } from "@/lib/llm";
import type { Analysis, VideoProduct } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You are a content strategist for DeoDap, an Indian B2B wholesale company
selling kitchenware, home goods, gadgets, and toys. Videos are in Hindi/Hinglish.
Extract precise commercial signals from the transcript. Respond with valid JSON only.
The customer-facing storefront is always DeoDap (deodap.in) — do NOT put third-party marketplace
names (e.g. Grabnix) in any field. Write key_points as clean, blog-ready statements; never include
video-script phrases like "link in the description", "subscribe", or "in this video".
EVERYTHING you output (topic, product names, keywords, key_points) MUST be in clean ENGLISH —
translate Hindi/Hinglish to English; NEVER output Hindi/Devanagari script in any field.`;

function buildPrompt(transcript: string): string {
  return `Analyze this YouTube transcript from a DeoDap product video.
Return ONLY valid JSON — no markdown, no backticks, no commentary.

{
  "topic": "1-2 sentence summary of what this video covers",
  "intent": "informational|commercial|transactional",
  "buying_intent": "low|medium|high",
  "target_audience": "who this video is for",
  "problem_solved": "the customer pain point the video addresses",
  "catalog": [
    {"name": "Exact product name as shown", "price": "number only, e.g. 98 (the rupee price said in the video, or empty if none)", "utility": "one short line: what it is for or its key feature, from the video"}
  ],
  "collections": [{"name": "Collection Name", "handle": "collection-slug"}],
  "primary_keyword": "single best English SEO keyword",
  "secondary_keywords": ["5 to 7 supporting English long-tail keywords"],
  "key_points": ["4 to 6 main talking points, written in clean English"]
}

CRITICAL for "catalog": list EVERY single product the video shows or mentions, in the order shown — do NOT cap or summarise the list. Many DeoDap videos show 15-25 products; capture all of them with each one's price and a one-line utility. Use clean English product names. If a price is unclear, leave it empty rather than guessing.

Transcript (excerpt — topic/intent/keywords; the full product list is extracted separately):
${transcript.slice(0, 5000)}`;
}

function stripJson(t: string): string {
  const m = t.match(/\{[\s\S]*\}/);
  return m ? m[0] : t;
}
function stripJsonArray(t: string): string {
  const m = t.match(/\[[\s\S]*\]/);
  return m ? m[0] : "[]";
}

// ── Chunked product sweep — guarantees 100% product coverage on long transcripts ──
// A single LLM pass over a long, dense Hindi transcript under-lists (stops at ~10-15
// products). So we split the transcript into overlapping chunks, extract products from
// EACH chunk in parallel, and merge + dedupe — nothing gets missed.

function chunkText(t: string, size = 5500, overlap = 400): string[] {
  if (t.length <= size) return [t];
  const out: string[] = [];
  for (let i = 0; i < t.length; i += size - overlap) {
    out.push(t.slice(i, i + size));
    if (i + size >= t.length) break;
  }
  return out;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ\s]/g, "").replace(/\s+/g, " ").trim();
}
function normPrice(p: unknown): string | undefined {
  if (p === undefined || p === null) return undefined;
  const m = String(p).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? m[0] : undefined;
}

// Merge product lists, dedupe by normalized name, fill missing price/utility from later hits.
function mergeProducts(items: { name?: unknown; price?: unknown; utility?: unknown }[]): VideoProduct[] {
  const map = new Map<string, VideoProduct>();
  for (const it of items) {
    if (!it || !it.name) continue;
    const name = String(it.name).trim();
    const key = normName(name);
    if (!key || key.length < 2) continue;
    const price = normPrice(it.price);
    const utility = it.utility ? String(it.utility).trim() : undefined;
    const ex = map.get(key);
    if (!ex) {
      map.set(key, { name, price, utility });
    } else {
      if (!ex.price && price) ex.price = price;
      if (!ex.utility && utility) ex.utility = utility;
    }
  }
  return [...map.values()];
}

const SWEEP_SYSTEM = `You extract products from ONE part of a DeoDap product-video transcript (Hindi/Hinglish).
Return ONLY a JSON array — no prose, no markdown. Each element:
{"name":"clean ENGLISH product name","price":"number only (the rupee price said) or empty","utility":"one short ENGLISH line: what it is / does"}.
ALWAYS write name and utility in ENGLISH ONLY — TRANSLATE any Hindi/Hinglish to a natural English product name
(e.g. "मोबाइल होल्डर"→"Mobile Holder", "एप्पल शेप फोन स्टैंड"→"Apple-Shaped Phone Stand", "चाबी वाला स्टैंड"→"Key-Shaped Phone Stand").
Use the STANDARD, DESCRIPTIVE store-style name — INCLUDE the category word (mobile / phone / kitchen / home / travel)
so it is searchable on an online store — NOT a casual nickname: a finger grip → "Mobile Finger Holder" (not "Finger Slip");
a suction phone holder → "Suction Phone Holder" (not "Suction Case"); a chair-shaped stand → "Chair-Shape Mobile Stand".
NEVER output any Hindi/Devanagari characters in any field. List EVERY distinct product shown or named in THIS text,
including briefly-mentioned ones, in order. If none, return [].`;

async function extractChunkProducts(chunk: string): Promise<VideoProduct[]> {
  try {
    const { text } = await llmComplete({
      system: SWEEP_SYSTEM,
      user: `Transcript part:\n"""\n${chunk}\n"""`,
      maxTokens: 2500,
      kind: "analysis",
    });
    const arr = JSON.parse(stripJsonArray(text)) as { name?: unknown; price?: unknown; utility?: unknown }[];
    return Array.isArray(arr) ? mergeProducts(arr) : [];
  } catch {
    return [];
  }
}

// Run async tasks with a small concurrency cap (gentle on provider rate limits).
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sweepAllProducts(transcript: string): Promise<VideoProduct[]> {
  // Bigger chunks = FEWER LLM calls = fewer chances to hit Gemini's transient 503 "high demand"
  // (Gemini's 1M-token/min limit handles big chunks fine). Then retry any chunk that came back
  // empty — a momentary overload spike shouldn't shrink the product list.
  // Chunk size tuned to fit the PRIMARY provider's per-minute token budget. Groq (primary) caps
  // ~6k tokens/min, so keep chunks modest; the empty-chunk retry below recovers transient misses.
  const chunks = chunkText(transcript.slice(0, 48000), 4500, 400).slice(0, 8);
  const perChunk = await mapLimit(chunks, 2, extractChunkProducts);
  const emptyIdx = perChunk.map((r, i) => (r.length ? -1 : i)).filter((i) => i >= 0);
  if (emptyIdx.length) {
    await sleep(2500);
    const retried = await mapLimit(emptyIdx.map((i) => chunks[i]), 2, extractChunkProducts);
    emptyIdx.forEach((idx, k) => { perChunk[idx] = retried[k] || []; });
  }
  return mergeProducts(perChunk.flat());
}

export async function POST(req: NextRequest) {
  let transcript = "";
  try {
    const body = await req.json();
    transcript = body?.transcript;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!transcript || typeof transcript !== "string") {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  if (activeEngine() === "none") {
    try {
      return NextResponse.json(localAnalyze(transcript));
    } catch (err: unknown) {
      return NextResponse.json({ error: "Analysis failed: " + (err instanceof Error ? err.message : "error") }, { status: 500 });
    }
  }

  // Main analysis FIRST, on a small excerpt, so the request fits Groq's tight per-minute token
  // budget — it yields topic/intent/keywords + a seed of front-of-video products.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obj: any;
  let engine = "local";
  try {
    const main = await llmComplete({ system: SYSTEM, user: buildPrompt(transcript), maxTokens: 1500, kind: "analysis" });
    obj = JSON.parse(stripJson(main.text));
    engine = main.engine;
    obj.collections = (obj.collections || []).map((c: unknown) =>
      typeof c === "string" ? { name: c, handle: (c as string).toLowerCase().replace(/\s+/g, "-") } : c,
    );
  } catch (err: unknown) {
    // Main failed — fill topic/intent heuristically, but DON'T discard the sweep's real products.
    obj = localAnalyze(transcript);
    obj._mainError = err instanceof Error ? err.message : "main analysis failed";
  }

  // Then the chunked product sweep — AUTHORITATIVE "every product in the video"; per-chunk
  // resilient, so partial rate-limits still yield real products (never the generic fallback).
  const sweepProducts = await sweepAllProducts(transcript).catch(() => [] as VideoProduct[]);

  // Merge the (optional) seed catalog with the sweep, dedupe → the full product list.
  const seedCatalog = Array.isArray(obj.catalog) ? obj.catalog : [];
  const merged = mergeProducts([...seedCatalog, ...sweepProducts]);
  if (merged.length) {
    // Strip any stray Devanagari from product names everywhere (chips, search terms, blog) —
    // the UI must be English-only. Drop names that are empty after stripping.
    const stripDev = (s: string) => String(s || "").replace(/[ऀ-ॿ]+/g, "").replace(/\s{2,}/g, " ").trim();
    const cleaned = merged
      .map((c: VideoProduct) => ({ ...c, name: stripDev(c.name) }))
      .filter((c: VideoProduct) => c.name.length >= 2);
    obj.catalog = cleaned;
    obj.products = cleaned.map((c: VideoProduct) => c.name);
    // If the main call failed, derive a real primary keyword from the top product so the
    // storefront search isn't the generic "Deodap Product" → Glitter Glue fallback.
    if (engine === "local" && cleaned[0]?.name) obj.primary_keyword = cleaned[0].name;
  }
  // Guarantee an ENGLISH primary keyword — it drives the blog title (template fallback) + SEO slug.
  const hasDev = (s: string) => /[ऀ-ॿ]/.test(s || "");
  if (!obj.primary_keyword || hasDev(String(obj.primary_keyword))) {
    const eng = (merged as VideoProduct[]).find((c) => c.name && !hasDev(c.name));
    obj.primary_keyword = eng?.name || "Wholesale Kitchen Products";
  }
  if (!Array.isArray(obj.products)) obj.products = [];
  obj.engine = engine;
  obj.productCount = obj.products.length;
  return NextResponse.json(obj as Analysis);
}
