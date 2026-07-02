import { NextRequest, NextResponse } from "next/server";
import { shopifyConfigured, searchProducts, searchCollections, type SfProduct, type SfCollection } from "@/lib/shopify";
import { searchStorefront, enrichCatalog, relevantStoreProducts } from "@/lib/storefront";
import { mockShopify } from "@/lib/localAnalyze";
import type { Analysis } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stage 04 — fetch relevant products & collections from Shopify (real when
// configured, deterministic demo data otherwise).
export async function POST(req: NextRequest) {
  const { analysis } = (await req.json()) as { analysis: Analysis };
  if (!analysis) return NextResponse.json({ error: "analysis required" }, { status: 400 });

  if (shopifyConfigured()) {
    try {
      const names = (analysis.products || []).slice(0, 5);
      const collNames = (analysis.collections || []).map((c) => c.name).slice(0, 3);

      const productLists = await Promise.all(names.map((n) => searchProducts(n, 2).catch(() => [] as SfProduct[])));
      const seen = new Set<string>();
      const products: SfProduct[] = [];
      for (const list of productLists) {
        for (const p of list) {
          if (!seen.has(p.handle)) { seen.add(p.handle); products.push(p); }
        }
      }

      const collLists = await Promise.all(collNames.map((n) => searchCollections(n, 1).catch(() => [] as SfCollection[])));
      const seenC = new Set<string>();
      const collections: SfCollection[] = [];
      for (const list of collLists) {
        for (const c of list) {
          if (!seenC.has(c.handle)) { seenC.add(c.handle); collections.push(c); }
        }
      }

      if (products.length >= 1) {
        return NextResponse.json({
          source: "shopify",
          products: products.slice(0, 4),
          collections: collections.slice(0, 3),
        });
      }
      // configured but nothing matched → try public storefront, then demo
    } catch {
      /* fall back below */
    }
  }

  // Real deodap.in public storefront — enrich EVERY product the video mentions
  // (full list, no cap) with real image, link, current price + Judge.me rating/reviews.
  try {
    const products = await enrichCatalog(analysis);
    if (products.length) {
      // Add topic-relevant IN-STOCK store products the video didn't show (fills gaps of
      // "relevant products missing"). The generate step relevance-filters the merged list.
      try {
        const extra = await relevantStoreProducts(analysis.primary_keyword, 8);
        const have = new Set(products.map((p) => p.handle));
        for (const e of extra) if (e.handle && !have.has(e.handle)) { have.add(e.handle); products.push(e); }
      } catch { /* supplement is best-effort */ }
      let collections = analysis.collections || [];
      // Only do the extra storefront search when the analysis gave us no collections —
      // avoids re-running product suggests that enrichCatalog already covered (saves ~2-5s).
      if (!collections.length) {
        try {
          const sf = await searchStorefront(analysis);
          if (sf.collections.length) collections = sf.collections;
        } catch { /* keep analysis collections */ }
      }
      return NextResponse.json({ source: "storefront", products, collections });
    }
  } catch {
    /* fall back to demo */
  }

  return NextResponse.json({ source: "demo", products: mockShopify(analysis), collections: analysis.collections || [] });
}
