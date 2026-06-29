// Public deodap.in storefront search. deodap.in is a public Shopify store, so its
// search-suggest endpoint returns REAL products/collections (working links + images)
// with NO Admin API token required. This fixes 404 product links from demo handles.
import type { Analysis, VideoProduct, ShopifyProduct } from "./types";

const STORE = (process.env.STOREFRONT_URL || "https://deodap.in").replace(/\/+$/, "");

export interface StoreProduct {
  title: string;
  handle: string;
  price: string;
  image_src: string;
  product_type: string;
  url: string;
}
export interface StoreCollection { name: string; handle: string }

function num(s: unknown): string {
  const m = String(s ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? String(Math.round(parseFloat(m[0]))) : "";
}
function handleFrom(url: string, kind: "products" | "collections"): string {
  const m = String(url || "").match(new RegExp(`/${kind}/([^/?#]+)`));
  return m ? m[1] : "";
}

// fetch with a hard timeout so one slow request never stalls the whole batch.
async function fetchT(url: string, opts: RequestInit = {}, ms = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function suggest(q: string, type: "product" | "collection", limit: number): Promise<Record<string, unknown> | null> {
  const url =
    `${STORE}/search/suggest.json?q=${encodeURIComponent(q)}` +
    `&resources[type]=${type}&resources[limit]=${limit}&resources[options][unavailable_products]=last`;
  const res = await fetchT(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  }, 6000);
  if (!res.ok) return null;
  return res.json();
}

export async function searchStorefront(
  analysis: Analysis,
): Promise<{ products: StoreProduct[]; collections: StoreCollection[] }> {
  // Product search terms: specific product names first, then the primary keyword.
  const terms = Array.from(
    new Set([...(analysis.products || []), analysis.primary_keyword].filter(Boolean)),
  ).slice(0, 5);

  const lists = await Promise.all(terms.map((t) => suggest(t, "product", 4).catch(() => null)));
  const seen = new Set<string>();
  const products: StoreProduct[] = [];
  for (const data of lists) {
    const items = ((data as any)?.resources?.results?.products || []) as any[];
    for (const p of items) {
      const handle = p.handle || handleFrom(p.url, "products");
      if (!handle || seen.has(handle)) continue;
      seen.add(handle);
      const img =
        (typeof p.image === "string" && p.image) ||
        p.featured_image?.url ||
        (typeof p.featured_image === "string" ? p.featured_image : "") ||
        (Array.isArray(p.images) ? p.images[0] : "") ||
        "";
      products.push({
        title: p.title || handle,
        handle,
        price: num(p.price),
        image_src: typeof img === "string" ? img : (img?.url || ""),
        product_type: p.type || p.product_type || "",
        url: `${STORE}/products/${handle}`,
      });
    }
  }

  // Collections: search by the analysis collection names (fallback to primary keyword).
  const collTerms = (analysis.collections || []).map((c) => c.name).filter(Boolean).slice(0, 3);
  const queries = collTerms.length ? collTerms : [analysis.primary_keyword].filter(Boolean);
  const collLists = await Promise.all(queries.map((t) => suggest(t, "collection", 2).catch(() => null)));
  const seenC = new Set<string>();
  const collections: StoreCollection[] = [];
  for (const data of collLists) {
    const items = ((data as any)?.resources?.results?.collections || []) as any[];
    for (const c of items) {
      const handle = c.handle || handleFrom(c.url, "collections");
      if (!handle || seenC.has(handle)) continue;
      seenC.add(handle);
      collections.push({ name: c.title || handle, handle });
    }
  }

  return { products: products.slice(0, 4), collections: collections.slice(0, 3) };
}

// ── Full-catalog enrichment ────────────────────────────────────────────────────
// Takes EVERY product the video mentions (from analysis.catalog) and enriches each
// with the real deodap.in image, link, current price and Judge.me rating/reviews.
// Transcript-only products (no store match) are still returned, so the FULL list shows.

// Run an async mapper with a small concurrency cap (be gentle to deodap.in).
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return out;
}

// Cache product ratings for an hour (each is one extra fetch).
const ratingCache = new Map<string, { at: number; v: { rating?: number; reviewCount?: number } }>();
const RATING_TTL = 60 * 60 * 1000;
// Product-template section id: lets us fetch ONLY the product section (~53KB) instead of the full
// 1.69MB page for the SAME rating JSON-LD. Constant across products; env-overridable in case a
// theme republish changes it (re-discover via data-section-id="…" in any product page).
const PRODUCT_SECTION_ID = process.env.DEODAP_PRODUCT_SECTION_ID || "template--26804433322294__main";
// NOTE: do NOT set Accept-Encoding manually — Node/undici auto-negotiates gzip/br AND
// auto-decompresses only when it owns the header. Setting it ourselves yields raw compressed bytes.
const RATING_HEADERS = { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" };

function parseAggRating(html: string): { rating?: number; reviewCount?: number } {
  const m = html.match(/"aggregateRating"\s*:\s*\{[^}]*\}/);
  if (!m) return {};
  try {
    const obj = (JSON.parse("{" + m[0] + "}") as { aggregateRating: { ratingValue?: unknown; reviewCount?: unknown } }).aggregateRating;
    const rating = parseFloat(String(obj.ratingValue));
    const reviewCount = parseInt(String(obj.reviewCount).replace(/[^\d]/g, ""), 10);
    return {
      rating: isFinite(rating) ? Math.round(rating * 10) / 10 : undefined,
      reviewCount: isFinite(reviewCount) ? reviewCount : undefined,
    };
  } catch {
    return {};
  }
}

async function fetchRating(handle: string): Promise<{ rating?: number; reviewCount?: number }> {
  if (!handle) return {};
  const hit = ratingCache.get(handle);
  if (hit && Date.now() - hit.at < RATING_TTL) return hit.v;
  let v: { rating?: number; reviewCount?: number } = {};
  try {
    // Fast path: Shopify Section Rendering API — same rating JSON-LD, ~4.6x smaller payload (~53KB vs 1.69MB).
    const res = await fetchT(`${STORE}/products/${handle}?section_id=${PRODUCT_SECTION_ID}`, { headers: RATING_HEADERS, cache: "no-store" }, 5000);
    if (res.ok) v = parseAggRating(await res.text());
    // Fall back to the full page if the section path gave nothing parseable
    // (stale section_id 404, OR a 200 without the rating block) — guarantees we don't lose ratings.
    if (v.rating === undefined) {
      const full = await fetchT(`${STORE}/products/${handle}`, { headers: RATING_HEADERS, cache: "no-store" }, 6000);
      if (full.ok) v = parseAggRating(await full.text());
    }
  } catch { /* network — leave rating empty */ }
  ratingCache.set(handle, { at: Date.now(), v });
  return v;
}

function bestProductMatch(items: Record<string, unknown>[]): {
  title: string; handle: string; price: string; image_src: string; product_type: string;
} | null {
  for (const p of items) {
    const handle = (p.handle as string) || handleFrom(p.url as string, "products");
    if (!handle) continue;
    const img =
      (typeof p.image === "string" && p.image) ||
      (p.featured_image as { url?: string })?.url ||
      (typeof p.featured_image === "string" ? p.featured_image : "") ||
      (Array.isArray(p.images) ? (p.images[0] as string) : "") || "";
    return {
      title: (p.title as string) || handle,
      handle,
      price: num(p.price),
      image_src: typeof img === "string" ? img : ((img as { url?: string })?.url || ""),
      product_type: (p.type as string) || (p.product_type as string) || "",
    };
  }
  return null;
}

// Drop leading descriptors → core noun phrase (last ~3 words) for a 2nd-chance store match.
function coreQuery(name: string): string {
  const words = name.split(/\s+/).filter((w) => w.length > 1);
  return words.length > 3 ? words.slice(-3).join(" ") : name;
}

// REAL, short product name for the console/blog: drop deodap.in's " – SEO descriptor" suffix
// (en/em dash surrounded by spaces — keeps hyphens like "2-in-1"), and strip any Devanagari.
function cleanName(t: string): string {
  return String(t || "")
    .split(/\s[–—]\s/)[0]
    .replace(/[ऀ-ॿ]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function enrichOne(c: VideoProduct): Promise<ShopifyProduct> {
  const txPrice = c.price ? Math.round(parseFloat(c.price)) || 0 : 0;
  const fallback: ShopifyProduct = {
    title: cleanName(c.name), handle: c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), price: txPrice,
    url: `${STORE}/search?q=${encodeURIComponent(c.name)}`, // store-search link when no exact match
    utility: c.utility, description: c.utility, matched: false,
  };
  try {
    const pick = async (q: string) =>
      bestProductMatch(
        ((await suggest(q, "product", 4)) as { resources?: { results?: { products?: Record<string, unknown>[] } } })?.resources?.results?.products || [],
      );
    let top = await pick(c.name);
    if (!top) {
      // 2nd chance: search the core noun phrase (drop leading descriptors) so fewer products end up unmatched.
      const core = coreQuery(c.name);
      if (core.toLowerCase() !== c.name.toLowerCase()) top = await pick(core);
    }
    if (!top) return fallback;
    const rating = await fetchRating(top.handle);
    const storePrice = top.price ? Math.round(parseFloat(top.price)) : 0;
    return {
      title: cleanName(top.title),
      handle: top.handle,
      url: `${STORE}/products/${top.handle}`,
      price: txPrice || storePrice, // video price is authoritative; store price is a fallback
      storePrice: storePrice || undefined,
      image_src: top.image_src,
      product_type: top.product_type,
      utility: c.utility,
      description: c.utility,
      rating: rating.rating,
      reviewCount: rating.reviewCount,
      matched: true,
    };
  } catch {
    return fallback;
  }
}

// Enrich the WHOLE video product list (no cap). Falls back to flat product names
// if the analysis has no detailed catalog.
export async function enrichCatalog(analysis: Analysis): Promise<ShopifyProduct[]> {
  const catalog: VideoProduct[] =
    analysis.catalog?.length ? analysis.catalog : (analysis.products || []).map((n) => ({ name: n }));
  if (!catalog.length) return [];
  const enriched = await mapLimit(catalog.slice(0, 40), 15, enrichOne);
  // Dedupe: two video-product names can resolve to the SAME store product — keep one.
  const seen = new Set<string>();
  const out: ShopifyProduct[] = [];
  for (const p of enriched) {
    const key = p.matched && p.handle
      ? `h:${p.handle}`
      : `t:${p.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
