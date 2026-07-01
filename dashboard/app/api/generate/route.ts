import { NextRequest, NextResponse } from "next/server";
import { localBlog } from "@/lib/blogTemplate";
import { llmComplete, activeEngine } from "@/lib/llm";
import type { Analysis, ShopifyProduct } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You are the in-house blog writer for DeoDap (deodap.in), an Indian online store for kitchenware,
home goods, gadgets and travel accessories at honest, budget-friendly prices. You write friendly, helpful "best of"
shopping guides that real people enjoy reading. Your readers are everyday Indian shoppers (and a few resellers)
looking for genuinely useful picks. You turn an auto-generated analysis + product list (from a Hindi/Hinglish video)
into a warm, scannable, benefit-led listicle blog post.

OUTPUT raw HTML only — no markdown, no code fences, no commentary. Valid HTML (posted to Shopify via API).

VOICE — write like a helpful human friend recommending things they actually like:
- Conversational, casual, warm and benefit-led. Talk TO the reader ("you", "your desk", "your kid's lunch").
- It's fine to open a thought with a relatable hook ("Bored of the same old lunch box?", "Tired of your phone
  sliding off the table?"). Sound human, never robotic or corporate. No hard-sell, no hype, no pressure.
- Lead with what the product DOES for the reader (the benefit and the everyday use-case), then the features.
- Vary your sentences. Keep paragraphs short and easy to skim. Never cut a sentence off mid-thought.

ARTICLE SHAPE (the exact HTML order is given in the user prompt — follow it; this is the spirit):
1. TITLE: a CATCHY, UNIQUE numbered listicle headline — NOT the generic "{N} Best [Category] in India 2026"
   template. Start with the count, add a power word + a real benefit or price hook + 2026, specific to what these
   products do (e.g. "9 Genius Kitchen Gadgets Under ₹99 That Make Cooking Effortless (2026)"). Human, never keyword-stuffed.
2. INTRO (~90 words): a problem→solution hook. Name the everyday pain, mention a couple of real use-cases, then
   promise the fix this list delivers. No CTA jammed mid-thought.
3. EACH PRODUCT is its own NUMBERED section in a SIMPLE, UN-BOXED format (no cards/tiles/boxes): a numbered product
   heading ("1. [Product Name] – [short benefit tag]"), then the product IMAGE on its own line (only if an image URL
   is given), then an OPENING SENTENCE stating the product's main job/benefit in plain language (sample voice: "This
   charming apple-shaped stand does double duty on any desk, holding your phone at a comfortable viewing angle while
   doubling as a pen and stationery holder."), then 5-7 short feature/benefit bullets mixing real use-cases and
   features, then a "Shop Now →" link. Keep ONE light price bullet among them. Everything flows normally down the page.
4. CONCLUSION: a "Final Thoughts"-style wrap-up that ties the picks back to everyday value.
5. FAQ: genuine, practical buyer questions ("Which one is best for a work desk?", "Does it work with both iPhone
   and Android?", "Which is easiest to clean?") with concise, factual answers. Never about keywords or SEO.

RULES:
1. HONEST PRICING HOOK: if you mention affordability, use the REAL lowest price — "starting at ₹<LOWEST ACTUAL
   PRICE>", never a price ceiling the products break. NEVER invent a discount %, MRP, "X% off", savings figure or
   any number you were not given.
2. NO FAKE URGENCY: never fabricate scarcity ("only 2 left", "stock running out") or fake deadlines. Warmth and
   usefulness sell here, not pressure.
3. CTAs: each product's call-to-action reads "Shop Now →". The bigger section CTAs use friendly, varied wording
   (e.g. "Shop the Collection →", "Browse the Full Range →") with an action verb + arrow. Keep them inviting, not pushy.
4. NATURAL SEO: weave the analysis keywords and the category name in naturally — in the title, once in the intro,
   and where they genuinely fit. Never keyword-stuff and never sound like an SEO bot.
5. FACTS ONLY: use only facts from the ANALYSIS/PRODUCTS blocks — never invent specs, materials, capacities, colours
   or claims. If you don't know it, don't say it.
6. STOREFRONT: the only store is DeoDap (deodap.in). Never name another store (e.g. Grabnix). Use the EXACT product
   URL given for each product; collection links use https://deodap.in/collections/<handle>.
7. NO transcript-isms ("in this video", "subscribe", "link in description", "as I mentioned"). NO emojis. Avoid tired
   filler idioms ("break the bank", "checks all the boxes", "add a touch of sophistication", "in today's fast-paced world").
8. SEMANTIC HTML: exactly one <h1>; section headings and the numbered product headings as proper headings; clean,
   crawlable hierarchy. Follow the exact tags in the user prompt. Do NOT wrap products in <div class="pcard">,
   <div class="pbody">, cards, tiles or any box wrapper — keep the layout plain and flowing.
9. LENGTH: aim for roughly 1200-1400 words of substance — enough to be genuinely helpful, never padded.
10. LANGUAGE: write the ENTIRE article — title, all headings, body and FAQ — in clear, natural ENGLISH. The source
    transcript is Hindi/Hinglish; TRANSLATE the ideas to English. NEVER output Hindi/Devanagari script anywhere
    (the <h1> title especially must be English for SEO). A light Indian-English touchpoint in prose is fine.`;

function buildProductsBlock(products: ShopifyProduct[]): string {
  if (!products.length) return "No specific products — write generically about the category.";
  return products
    .map((p) => {
      const img = (p as { image_src?: string }).image_src;
      const url = (p as { url?: string }).url || `https://deodap.in/products/${p.handle}`;
      const use = (p as { utility?: string }).utility || p.product_type || "";
      const rating = (p as { rating?: number }).rating;
      const reviews = (p as { reviewCount?: number }).reviewCount;
      return `- ${p.title} | url: ${url} | ₹${p.price} | best_for: ${use}${img ? ` | image: ${img}` : ""}${rating != null ? ` | rating: ${rating}★ (${reviews || 0} reviews)` : ""}`;
    })
    .join("\n");
}

function buildPrompt(a: Analysis, products: ShopifyProduct[]): string {
  const coll = a.collections?.[0]?.handle || "all";
  return `Transform the auto-generated analysis below into a Shopify blog article.
Output ONLY valid HTML, in EXACTLY this structure and order:

<h1>[A CATCHY, UNIQUE, SEO-FRIENDLY listicle headline — do NOT use the generic "{N} Best [Category] in India 2026" template (that is boring and over-used). START with the product count (the exact number of products listed below), Title Case, ~55-72 characters. Make it specific and click-worthy by combining: the NUMBER + a POWER/EMOTION word (Genius, Clever, Must-Have, Game-Changing, Underrated, Viral, Space-Saving, Time-Saving) + the CONCRETE category + a REAL benefit or a price hook (Under ₹X) + 2026. Weave the primary keyword in naturally. Invent a FRESH title for THESE specific products — never reuse the examples verbatim. STYLE examples (do not copy): "9 Genius Kitchen Gadgets Under ₹99 That Make Cooking Effortless (2026)", "7 Must-Have Mobile Holders Every Indian Desk Needs in 2026", "8 Clever Lunch Boxes That Keep School & Office Meals Fresh — 2026". The title MUST feel unique to what these products actually DO, not a keyword-stuffed clone.]</h1>
<p>[A warm, conversational PROBLEM→SOLUTION intro of ABOUT 90 words, ONE short paragraph. First NAME THE EVERYDAY PAIN this category solves, then list 2-3 real use-cases / who it is for, then PROMISE THE FIX — that the picks below are practical and budget-friendly. Casual and human (you may open with a light question like "Bored of the same old lunch box?"). CHECK PRICES FIRST: if you mention affordability, say "starting as low as ₹<lowest actual price from the product list>" — never a price ceiling the products break. Do NOT place a CTA box right after this intro.]</p>

<h2>[A SLIM value-proposition heading — a high-intent phrase, e.g. "What Makes a Great [Category]"]</h2>
<p>[1-2 sentence lead.]</p>
<ul>
  [A SLIM category section: ONLY 1-2 SHORT bullets (max 2), each opening with a BOLD label then a concrete benefit. Derive real groupings from the actual products; keep each bullet to one line. Example shape:
   <li><strong>Everyday Use:</strong> practical, time-saving picks for daily life.</li>
   <li><strong>Budget-Friendly:</strong> factory-direct prices that suit households and resellers.</li>]
</ul>

[Output ONE NUMBERED PRODUCT SECTION below for EVERY product in the PRODUCTS list, IN ORDER — do NOT skip, merge or summarise any product. Number them sequentially starting at 1. IMPORTANT: keep it a SIMPLE, un-boxed section — do NOT wrap products in <div class="pcard">, <div class="pbody">, cards, tiles or any box. Just the heading, image, paragraph, bullets and link flowing normally, EXACTLY this shape:]
<h2>[N]. [A descriptive product name: the number, then the product's name plus a short benefit tag, e.g. "1. Apple-Shaped Mobile Stand with Pen Holder – 2-in-1 Desk Organizer"]</h2>
[PRODUCT IMAGE on its OWN line (only if an image URL is given): <img class="pimg" src="THE_EXACT_image_URL" alt="[product name]" loading="lazy"> — copy the URL verbatim. If NO "image:" URL is given for this product, OMIT the image line entirely (do NOT output a placeholder box).]
<p>[ONE opening sentence stating this product's PRIMARY function/benefit in plain language, e.g. "This charming apple-shaped stand does double duty on any desk, holding your phone at a comfortable viewing angle while doubling as a pen and stationery holder."]</p>
<ul>
  [5 to 7 SHORT feature/benefit bullets, each starting with a BOLD lead phrase then a concrete use-case or feature — facts only, unique to this product. Keep ONE light price line "<li><strong>Price:</strong> ₹[price]</li>". One line each. Example shape:
   <li><strong>Price:</strong> ₹[price]</li>
   <li><strong>Best for:</strong> [primary use case from best_for].</li>
   <li><strong>2-in-1 design:</strong> [a concrete feature].</li>
   <li><strong>Sturdy build:</strong> [a concrete feature].</li>
   <li><strong>Great gift:</strong> [a use-case].</li>]
</ul>
<a class="pbtn" href="[the exact url for this product]">Shop Now →</a>

<h2>Final Thoughts</h2>
<p>[A short, friendly closing paragraph linking the picks to the reader's everyday value — no hard sell.]</p>

<h2>Frequently Asked Questions</h2>
<dl>
  <dt>[a genuine, PRACTICAL customer question]?</dt><dd>[concise factual answer]</dd>
  [5 to 6 question/answer pairs — real, practical questions about use, fit, price, care or delivery (e.g. "Which one is best for a work desk?", "Do these work with both iPhone and Android?", "Which is best for charging?"); NEVER about keywords or SEO.]
</dl>
<div class="cta"><p>[closing hook]</p><a class="ctabtn" href="https://deodap.in/collections/${coll}">Shop the Collection →</a></div>

=== ANALYSIS ===
Topic: ${a.topic}
Problem solved: ${a.problem_solved}
Search intent: ${a.intent}
Buying intent: ${a.buying_intent}
Audience: ${a.target_audience}
Primary keyword: ${a.primary_keyword}
Secondary keywords: ${a.secondary_keywords.join(", ")}
Key points:
${a.key_points.map((k) => "- " + k).join("\n")}

=== PRODUCTS (output one uniform block each, in this order) ===
${buildProductsBlock(products)}

=== COLLECTIONS ===
${a.collections.map((c) => `- ${c.name} (https://deodap.in/collections/${c.handle})`).join("\n")}

REMINDERS:
- There are EXACTLY ${products.length} products below. The <h1> MUST START WITH the number ${products.length} and be CATCHY/UNIQUE (not "${products.length} Best …"). Output a NUMBERED <h2> product section for EVERY one, numbered 1 to ${products.length} — do not skip or merge any.
- Do NOT box products in <div class="pcard">/cards — plain flowing sections only. If an "image:" URL is given, copy it verbatim into <img class="pimg" src>; if none, OMIT the image (no placeholder box).
- Use the EXACT "url:" for that product's "Shop Now →" link — never invent handles.
- MANDATORY: the post MUST end with the <h2>Frequently Asked Questions</h2> + <dl><dt><dd> section (5-6 pairs)
  and the final CTA. Keep each product's bullets short (5-7, one line each) so you NEVER run out of room before the FAQ. The FAQ is required for schema.
- Use the primary keyword in the <h1> and once in the intro; weave secondary keywords in naturally — do not keyword-stuff.
- Keep prose conversational and scannable: a ~90-word intro, short bullets, not text walls. Write the COMPLETE HTML now.`;
}

// A blog is "complete" only if it has the FAQ section AND most of the featured product blocks.
// A single LLM pass occasionally returns a short/truncated post; we use this to retry / fall back.
function blogIsComplete(html: string, productCount: number): boolean {
  // Products are now plain (un-boxed) sections, so count the per-product "Shop Now" CTAs.
  const blocks = (html.match(/Shop Now/gi) || []).length;
  const hasFaq = /<dt[\s>]/i.test(html);
  return hasFaq && blocks >= Math.min(productCount, 6);
}

// Embed the FAQ block as a Google-ready FAQPage JSON-LD schema (a <script type="application/ld+json">)
// at the end of the article, so the published Shopify post ships with FAQ structured data / rich results.
// Built deterministically from the visible <dl><dt>/<dd> pairs → always valid JSON.
function withFaqSchema(html: string): string {
  const dl = html.match(/<dl>([\s\S]*?)<\/dl>/i);
  if (!dl) return html;
  const qs = [...dl[1].matchAll(/<dt>([\s\S]*?)<\/dt>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  const as = [...dl[1].matchAll(/<dd>([\s\S]*?)<\/dd>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  const pairs: [string, string][] = [];
  for (let i = 0; i < Math.min(qs.length, as.length); i++) if (qs[i] && as[i]) pairs.push([qs[i], as[i]]);
  if (!pairs.length) return html;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  return `${html}\n<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

export async function POST(req: NextRequest) {
  let analysis: Analysis;
  let products: ShopifyProduct[];
  try {
    const body = (await req.json()) as { analysis: Analysis; products: ShopifyProduct[] };
    analysis = body.analysis;
    products = body.products;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!analysis) return NextResponse.json({ error: "analysis required" }, { status: 400 });

  // Feature a CURATED set in the blog. Real DeoDap videos have 30-40 products; emitting all of
  // them overflows the output-token budget and truncates the end of the post (FAQ + closing get
  // cut off). Prioritise products MATCHED on the store (real image, link, rating) so every featured
  // card is rich, then keep 12 — the FULL structure stays intact. The Products tab still lists all.
  products = (products || [])
    .slice()
    .sort((a, b) => (b.matched ? 1 : 0) - (a.matched ? 1 : 0))
    .slice(0, 12);

  if (activeEngine() === "none") {
    try {
      const r = localBlog(analysis, products || []);
      return NextResponse.json({ title: r.title, html: withFaqSchema(r.html), engine: "local" });
    } catch (err: unknown) {
      return NextResponse.json({ error: "Blog generation failed: " + (err instanceof Error ? err.message : "error") }, { status: 500 });
    }
  }

  const cleanHtml = (text: string): string => {
    let html = text.trim().replace(/^```html\s*/i, "").replace(/```$/i, "").trim();
    html = html.replace(/<img[^>]*\ssrc=""[^>]*>/gi, "");                                          // drop empty-image tags
    html = html.replace(/href="https:\/\/deodap\.in\/products\/"/gi, 'href="https://deodap.in"');  // guard empty handles
    return html;
  };
  const titleOf = (html: string): string => {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    return h1 ? h1[1].replace(/<[^>]+>/g, "").trim() : analysis.primary_keyword;
  };

  // Generate, then VALIDATE. One LLM pass sometimes returns a truncated post (no FAQ, 2 blocks).
  // Retry once for a complete one; keep the best partial; if neither is complete, use the
  // deterministic template so the user NEVER sees a broken blog.
  let best: { html: string; engine: string } | null = null;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, engine } = await llmComplete({
        system: SYSTEM, user: buildPrompt(analysis, products), maxTokens: 6000, kind: "blog",
      });
      const html = cleanHtml(text);
      if (blogIsComplete(html, products.length)) {
        return NextResponse.json({ title: titleOf(html), html: withFaqSchema(html), engine });
      }
      if (!best || html.length > best.html.length) best = { html, engine }; // keep longest partial
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : "error";
    }
  }

  try {
    const r = localBlog(analysis, products); // always complete: every product + FAQ
    return NextResponse.json({ title: r.title, html: withFaqSchema(r.html), engine: "template", _note: lastError || "LLM post was incomplete; used the built-in template" });
  } catch {
    if (best) return NextResponse.json({ title: titleOf(best.html), html: withFaqSchema(best.html), engine: best.engine, _note: "partial" });
    return NextResponse.json({ error: "Blog generation failed: " + (lastError || "unknown") }, { status: 500 });
  }
}
