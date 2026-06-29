import type { Analysis, Collection, ShopifyProduct, SeoPack, SchemaPack } from "./types";

// ── helpers ──────────────────────────────────────────────────────────────────
export function extractVideoId(url: string): string | null {
  const pats = [
    /youtube\.com\/watch\?.*v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of pats) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/^-|-$/g, "");
}

const ACRONYMS = new Set(["LED", "USB", "FAQ", "OG", "CTA", "PVC", "ABS", "HD", "3D", "LCD", "SS"]);
const DESCRIPTORS = new Set([
  "stainless", "steel", "multicolor", "multi", "led", "string", "fairy", "warm", "white", "cool",
  "decorative", "shape", "diya", "plastic", "glass", "wooden", "ceramic", "copper", "brass",
  "electric", "rechargeable", "waterproof", "cotton", "silk", "premium", "mini", "jumbo",
  "portable", "foldable",
]);

function titleCaseWord(w: string): string {
  w = (w || "").replace(/[^a-zA-Z0-9]/g, "");
  if (!w) return "";
  if (ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}
function titleCase(s: string): string {
  return (s || "").split(/\s+/).map(titleCaseWord).filter(Boolean).join(" ").trim();
}
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STOP = new Set(
  "a an the and or but if then is are was were be been being to of in on at for with from by as it its this that these those i you he she we they me him her us them my your his our their aaj hum yeh ye hai hain ka ke ki ko mein me se par bhi toh aur ek bahut aap kar karein karo nahi na bilkul jo jab ya ab abhi sirf bana banate liye wala wali raha rahe rehta dino tak baat baare karte friends hello namaste dhanyavad doston ghar pe collection collections amazing available items item saari range today offer sale paas humare dikhaunga main transform season check khareedein product products best".split(
    /\s+/,
  ),
);

const PRODUCT_HINTS = [
  "casserole", "container", "bottle", "jar", "lights", "led", "candle", "fairy lights",
  "string lights", "pot", "pan", "kadhai", "tawa", "knife", "peeler", "grater", "organizer",
  "rack", "holder", "mat", "cover", "set", "kit", "box", "gadget", "toy", "bag", "brush", "mop",
  "wiper", "dispenser", "tiffin", "lunch box", "water bottle", "spice", "masala", "cookware",
  "kitchenware", "bedsheet", "rajai", "blanket", "cushion", "curtain", "diya",
];
const COLLECTION_HINTS: Record<string, string> = {
  casserole: "kitchen-essentials", pot: "cookware", pan: "cookware", kadhai: "cookware", tawa: "cookware",
  lights: "festive-decor", led: "festive-decor", candle: "festive-decor", diya: "festive-decor",
  "fairy lights": "festive-decor", "string lights": "festive-decor",
  toy: "kids-toys", gadget: "gadgets", bottle: "kitchen-essentials", tiffin: "kitchen-essentials",
  "lunch box": "kitchen-essentials", bedsheet: "home-furnishing", rajai: "home-furnishing",
  blanket: "home-furnishing", cushion: "home-furnishing", curtain: "home-furnishing",
};

function buildProductName(text: string, lower: string, hint: string): string {
  const descAlt = [...DESCRIPTORS].join("|");
  const re = new RegExp("((?:(?:" + descAlt + ")\\s+){0,4})" + escRe(hint) + "s?\\b", "i");
  const m = lower.match(re);
  let parts: string[];
  if (m && m[1] && m[1].trim()) parts = m[1].trim().split(/\s+/).filter(Boolean).concat(hint.split(" "));
  else parts = hint.split(" ");
  return parts.map(titleCaseWord).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
function dedupSubstrings(arr: string[]): string[] {
  const sorted = [...new Set(arr)].sort((a, b) => b.length - a.length);
  const keep: string[] = [];
  sorted.forEach((s) => {
    if (!keep.some((k) => k.toLowerCase().includes(s.toLowerCase()))) keep.push(s);
  });
  return keep;
}
function topNoun(words: string[]): string {
  const freq: Record<string, number> = {};
  words.forEach((w) => {
    if (w.length > 4 && !STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  });
  const r = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  return r ? r[0] : "";
}

function inferProblem(lower: string, primary: string): string {
  if (/casserole|pot|cookware|kitchen/.test(lower))
    return `Finding a durable, affordable ${primary.toLowerCase()} that keeps food warm and lasts long in a busy Indian kitchen.`;
  if (/light|led|diya|festive|diwali/.test(lower))
    return `Decorating the home affordably and safely for festivals without expensive or unsafe lighting.`;
  if (/toy/.test(lower)) return `Getting safe, fun, value-for-money toys for kids without overspending.`;
  return `Choosing a reliable, value-for-money ${primary.toLowerCase()} for everyday Indian household use.`;
}
function inferAudience(lower: string): string {
  if (/kitchen|casserole|dal|sabzi|cook/.test(lower)) return "Indian home cooks & value-conscious household shoppers";
  if (/diwali|festive|light|decor/.test(lower)) return "Families decorating their homes for festivals on a budget";
  if (/wholesale|bulk|reseller/.test(lower)) return "Resellers & bulk buyers sourcing for D2C/retail";
  return "Budget-conscious Indian online shoppers";
}
function buildSecondary(primary: string, ranked: string[]): string[] {
  const p = primary.toLowerCase();
  const out = [`best ${p} in india`, `${p} online`, `${p} price`, `buy ${p}`, `${p} wholesale`];
  ranked.slice(0, 4).forEach((r) => {
    if (!p.includes(r) && out.length < 8) out.push(`${r} ${p}`);
  });
  return [...new Set(out)].slice(0, 7);
}
function synthKeyPoints(text: string, lower: string): string[] {
  const pts: string[] = [];
  const materials: [string, string][] = [
    ["stainless steel", "premium stainless steel"], ["plastic", "sturdy food-grade plastic"],
    ["cotton", "soft breathable cotton"], ["glass", "toughened glass"], ["steel", "durable steel"],
  ];
  for (const [m, label] of materials) {
    if (lower.includes(m)) { pts.push(`Made from ${label} — built to last through daily use`); break; }
  }
  const pm = text.match(/(?:₹|rs\.?\s?)\s?(\d{2,5})|(\d{2,5})\s*(?:rupaye|rupees)/i);
  const price = pm ? pm[1] || pm[2] : null;
  if (price) pts.push(`Budget-friendly pricing — starts at around ₹${price}`);
  if (/waterproof/i.test(lower)) pts.push("Waterproof build — safe for balconies, gardens and outdoor use");
  if (/\blid\b/i.test(lower)) pts.push("Tight-fitting lid keeps food warm and fresh for hours");
  if (/rechargeable|battery/i.test(lower)) pts.push("Convenient rechargeable design — no messy wires");
  if (/\bleds?\b/i.test(lower)) pts.push("Bright, energy-efficient LED lighting");
  if (/\bsafe\b|no fire|fire risk/i.test(lower)) pts.push("Child-safe design with no open-flame fire risk");
  const cap = text.match(/(\d+(?:\.\d+)?)\s*(litre|liter|meter|metre|ml|inch)/i);
  if (cap) pts.push(`Practical ${cap[1]} ${cap[2].toLowerCase()} size — right for Indian families`);
  const ledCount = text.match(/(\d{2,4})\s*led/i);
  if (ledCount) pts.push(`Packed with ${ledCount[1]} LED bulbs for full, even coverage`);
  const store = /grabnix/i.test(lower) ? "Grabnix" : "DeoDap";
  pts.push(`Available on ${store} at wholesale-friendly prices with home delivery`);
  const generic = [
    "Designed for everyday Indian household use",
    "Backed by DeoDap's quality-and-value promise",
    "Easy to order online with fast delivery across India",
  ];
  let i = 0;
  while (pts.length < 4 && i < generic.length) {
    if (!pts.includes(generic[i])) pts.push(generic[i]);
    i++;
  }
  return [...new Set(pts)].slice(0, 6);
}

// ── the offline analyzer (fallback when no Anthropic key is set) ──────────────
export function localAnalyze(transcript: string): Analysis {
  const text = transcript.trim();
  const lower = text.toLowerCase();
  const words = lower.replace(/[^a-z0-9ऀ-ॿ\s]/g, " ").split(/\s+/).filter(Boolean);

  const buySignals = ["price", "buy", "order", "rupaye", "rupees", "₹", "rs", "discount", "offer",
    "deal", "affordable", "cheap", "budget", "wholesale", "delivery", "cart", "shop", "sale", "purchase"];
  let buyHits = 0;
  buySignals.forEach((s) => { buyHits += lower.split(s).length - 1; });
  const hasPrice = /(₹|rs\.?\s?\d|\d+\s?(rupaye|rupees))/i.test(text);
  let buying: Analysis["buying_intent"] = "low";
  if (buyHits >= 5 || (hasPrice && buyHits >= 2)) buying = "high";
  else if (buyHits >= 2 || hasPrice) buying = "medium";

  let search: Analysis["intent"] = "informational";
  if (/\b(best|top|vs|versus|compare|comparison|review|which|kaunsa|achha)\b/i.test(lower)) search = "commercial";
  if (/\b(buy|order|price|discount|shop now|delivery|wholesale)\b/i.test(lower) && buying === "high") search = "transactional";

  const found: string[] = [];
  PRODUCT_HINTS.forEach((h) => {
    const re = new RegExp("\\b" + escRe(h) + "s?\\b", "i");
    if (re.test(lower) && !found.includes(h)) found.push(h);
  });
  let products = dedupSubstrings(found.map((h) => buildProductName(text, lower, h)).filter(Boolean)).slice(0, 5);
  if (products.length === 0) products.push(titleCase(topNoun(words)) || "DeoDap Product");

  const collSet = new Set<string>();
  found.forEach((h) => { if (COLLECTION_HINTS[h]) collSet.add(COLLECTION_HINTS[h]); });
  if (collSet.size === 0) collSet.add("home-essentials");
  const collections: Collection[] = [...collSet].slice(0, 3).map((slug) => ({
    name: titleCase(slug.replace(/-/g, " ")), handle: slug,
  }));

  const freq: Record<string, number> = {};
  words.forEach((w) => {
    if (w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w)) freq[w] = (freq[w] || 0) + 1;
  });
  const ranked = Object.entries(freq).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  // titleCase strips non-Latin, so a pure-Hindi token can collapse to "" — guard it.
  const primary = titleCase(products[0] || ranked[0] || "product") || "DeoDap Product";

  return {
    topic: `${primary} — ${products.length > 1 ? "product showcase" : "product spotlight"} for Indian homes`,
    intent: search,
    buying_intent: buying,
    target_audience: inferAudience(lower),
    problem_solved: inferProblem(lower, primary),
    products,
    collections,
    primary_keyword: primary,
    secondary_keywords: buildSecondary(primary, ranked),
    key_points: synthKeyPoints(text, lower),
    engine: "local",
  };
}

// ── mock Shopify product data (deterministic placeholders) ────────────────────
export function mockShopify(analysis: Analysis): ShopifyProduct[] {
  const colors = ["#0d9488", "#0f766e", "#2563eb", "#7c3aed", "#db2777"];
  const products: ShopifyProduct[] = analysis.products.slice(0, 4).map((name, i) => ({
    title: name,
    handle: slugify(name),
    price: [499, 299, 799, 349, 199][i % 5],
    image_color: colors[i % colors.length],
    product_type: analysis.collections[0]?.name || "Home",
  }));
  while (products.length < 2) {
    const i = products.length;
    products.push({
      title: `${analysis.primary_keyword} ${["Pro", "Deluxe"][i] || "Plus"}`,
      handle: slugify(analysis.primary_keyword + "-" + i),
      price: [599, 449][i] || 399,
      image_color: colors[i % colors.length],
      product_type: "Home",
    });
  }
  return products;
}

// ── deterministic SEO + JSON-LD schema builders ───────────────────────────────
// SEO <title>: keyword-FIRST, intent-matched, ONE power word + an optional price/year hook +
// the brand — ALWAYS <=60 chars via a fallback chain that NEVER drops the keyword or goes generic.
function buildSeoTitle(a: Analysis, lowestPrice?: number, count?: number): string {
  const BRAND = "DeoDap";
  const YR = "2026";
  let kw = (titleCase(a.primary_keyword) || "Wholesale Products").replace(/\s{2,}/g, " ").trim();
  if (kw.length > 44) kw = kw.slice(0, 44).replace(/\s+\S*$/, "").trim(); // leave room for modifiers
  const hook = lowestPrice && lowestPrice > 0 ? `From ₹${lowestPrice}` : "";
  // DeoDap's real blogs are numbered listicles ("7 Best … in India 2026"). Prefix the product
  // count when there are enough products AND the result still fits in 60 chars.
  const n = count && count >= 3 ? count : 0;

  let candidates: string[];
  if (a.intent === "transactional") {
    candidates = [
      hook && `Buy ${kw} Online ${hook} | ${BRAND}`,
      `Buy ${kw} Online at Wholesale Price | ${BRAND}`,
      `Buy ${kw} Online | ${BRAND}`,
      `${kw} — Wholesale Price | ${BRAND}`,
      `${kw} | ${BRAND}`,
    ].filter(Boolean) as string[];
  } else if (a.intent === "commercial") {
    candidates = [
      n && `${n} Best ${kw} in India ${YR} | ${BRAND}`,
      n && `${n} Best ${kw} in India | ${BRAND}`,
      hook && `Best ${kw} in India ${hook} | ${BRAND}`,
      `Best ${kw} in India ${YR} | ${BRAND}`,
      `Best ${kw} at Wholesale Prices | ${BRAND}`,
      `Best ${kw} in India | ${BRAND}`,
      `${kw} | ${BRAND}`,
    ].filter(Boolean) as string[];
  } else {
    candidates = [
      n && `${n} Best ${kw} in India ${YR} | ${BRAND}`,
      `${kw}: Smart Buying Guide ${YR} | ${BRAND}`,
      `${kw}: Wholesale Buying Guide | ${BRAND}`,
      `${kw} — Buying Guide | ${BRAND}`,
      `${kw} Guide | ${BRAND}`,
      `${kw} | ${BRAND}`,
    ].filter(Boolean) as string[];
  }
  for (const t of candidates) {
    const clean = t.replace(/\s{2,}/g, " ").trim();
    if (clean.length <= 60) return clean;
  }
  const last = `${kw} | ${BRAND}`;
  return last.length <= 60 ? last : kw.slice(0, 57).replace(/\s+\S*$/, "").trim() + "…";
}
function buildMetaDesc(kw: string): string {
  const k = kw.toLowerCase();
  const lead = `Discover the best ${k} for Indian homes at wholesale prices on DeoDap.`;
  // Ordered so a full clause completes the description cleanly (no mid-sentence cut).
  const clauses = [
    " Durable, value-for-money picks built for everyday use.",
    " Trusted quality with fast delivery across India.",
    " Shop the collection and save big today.",
  ];
  let d = lead;
  for (const c of clauses) if ((d + c).length <= 160) d += c;
  if (d.length > 160) d = d.slice(0, 157).replace(/\s+\S*$/, "") + "…";
  return d;
}
const DEODAP_LOGO = "https://deodap.in/cdn/shop/files/deodap-logo.png";

function htmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildMetaTags(p: {
  seoTitle: string; metaDesc: string; canonical: string; robots: string;
  keywords: string[]; imageAlt: string;
  ogTags: Record<string, string>; twitterTags: Record<string, string>;
}): string {
  const lines = [
    `<title>${htmlEsc(p.seoTitle)}</title>`,
    `<meta name="description" content="${htmlEsc(p.metaDesc)}">`,
    `<meta name="keywords" content="${htmlEsc(p.keywords.join(", "))}">`,
    `<meta name="robots" content="${htmlEsc(p.robots)}">`,
    `<link rel="canonical" href="${p.canonical}">`,
    ...Object.entries(p.ogTags).map(([k, v]) => `<meta property="${k}" content="${htmlEsc(v)}">`),
    `<meta property="og:image:alt" content="${htmlEsc(p.imageAlt)}">`,
    ...Object.entries(p.twitterTags).map(([k, v]) => `<meta name="${k}" content="${htmlEsc(v)}">`),
  ];
  return lines.join("\n");
}

export function buildSeo(a: Analysis, products: ShopifyProduct[], html = ""): SeoPack {
  const prices = products.map((p) => p.price).filter((n): n is number => typeof n === "number" && n > 0);
  const lowestPrice = prices.length ? Math.min(...prices) : undefined;
  const seoTitle = buildSeoTitle(a, lowestPrice, products.length);
  const metaDesc = buildMetaDesc(a.primary_keyword);
  const slug = slugify(a.primary_keyword + "-deodap");
  const canonical = `https://deodap.in/blogs/all/${slug}`;
  const focusKeyword = a.primary_keyword;
  const keywords = Array.from(
    new Set([a.primary_keyword, ...(a.secondary_keywords || [])].map((s) => String(s).trim()).filter(Boolean)),
  );
  const featuredColor = products[0]?.image_color || "#0d9488";
  const imageUrl =
    (products.find((p) => (p as { image_src?: string }).image_src) as { image_src?: string } | undefined)?.image_src ||
    DEODAP_LOGO;
  const imageAlt = `${a.primary_keyword} — DeoDap`;
  const wordCount = html ? (html.replace(/<[^>]+>/g, " ").match(/\S+/g)?.length || 0) : 0;
  const readingTime = Math.max(1, Math.round(wordCount / 200));
  const robots = "index, follow, max-image-preview:large, max-snippet:-1";
  const ogTags: Record<string, string> = {
    "og:title": seoTitle,
    "og:description": metaDesc,
    "og:type": "article",
    "og:url": canonical,
    "og:site_name": "DeoDap",
    "og:locale": "en_IN",
    "og:image": imageUrl,
  };
  const twitterTags: Record<string, string> = {
    "twitter:card": "summary_large_image",
    "twitter:title": seoTitle,
    "twitter:description": metaDesc,
    "twitter:image": imageUrl,
  };
  const metaTags = buildMetaTags({ seoTitle, metaDesc, canonical, robots, keywords, imageAlt, ogTags, twitterTags });
  return {
    seoTitle, metaDesc, slug, canonical, focusKeyword, keywords, robots,
    imageUrl, imageAlt, ogTags, twitterTags, wordCount, readingTime, metaTags, featuredColor,
  };
}

export function buildSchema(
  a: Analysis,
  seo: SeoPack,
  faqs: [string, string][],
  ctx?: { videoId?: string | null; videoTitle?: string },
): SchemaPack {
  const CTX = "https://schema.org";
  const now = new Date().toISOString();

  const faqNode = {
    "@type": "FAQPage",
    mainEntity: faqs.map(([q, ans]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: ans },
    })),
  };

  const articleNode: Record<string, unknown> = {
    "@type": "BlogPosting",
    headline: seo.seoTitle,
    description: seo.metaDesc,
    author: { "@type": "Organization", name: "DeoDap", url: "https://deodap.in" },
    publisher: {
      "@type": "Organization",
      name: "DeoDap",
      url: "https://deodap.in",
      logo: { "@type": "ImageObject", url: DEODAP_LOGO },
    },
    datePublished: now,
    dateModified: now,
    mainEntityOfPage: { "@type": "WebPage", "@id": seo.canonical },
    keywords: seo.keywords.join(", "),
    articleSection: a.collections?.[0]?.name || "Shopping Guides",
    inLanguage: "en-IN",
  };
  if (seo.imageUrl) articleNode.image = [seo.imageUrl];
  if (seo.wordCount) articleNode.wordCount = seo.wordCount;

  const breadcrumbNode = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://deodap.in" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://deodap.in/blogs/all" },
      { "@type": "ListItem", position: 3, name: seo.seoTitle, item: seo.canonical },
    ],
  };

  // VideoObject — the source YouTube video (ACTIVE Google rich result in 2026).
  // Required by Google: name, thumbnailUrl, uploadDate. We don't know the real upload date,
  // so we use the article's publish date as a valid-format proxy.
  const videoNode = ctx?.videoId
    ? {
        "@type": "VideoObject",
        name: ctx.videoTitle || seo.seoTitle,
        description: seo.metaDesc,
        thumbnailUrl: [`https://i.ytimg.com/vi/${ctx.videoId}/hqdefault.jpg`],
        uploadDate: now,
        contentUrl: `https://www.youtube.com/watch?v=${ctx.videoId}`,
        embedUrl: `https://www.youtube.com/embed/${ctx.videoId}`,
        publisher: { "@type": "Organization", name: "DeoDap", logo: { "@type": "ImageObject", url: DEODAP_LOGO } },
      }
    : null;

  // SoftwareApplication — identity of the tool itself (for ITS OWN landing page, NOT the blog @graph,
  // to avoid mixing unrelated types). Free app → offers.price "0". No fake aggregateRating.
  const softwareNode = {
    "@type": "SoftwareApplication",
    name: "DeoDap Blog Drafter",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: "Turns YouTube product videos into SEO-optimized Shopify blog drafts automatically.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    featureList: [
      "YouTube transcript extraction",
      "AI topic & intent analysis",
      "Automatic product matching from the store",
      "SEO blog generation",
      "JSON-LD schema generation",
      "One-click Shopify draft",
    ],
    publisher: { "@type": "Organization", name: "DeoDap", url: "https://deodap.in" },
  };

  const faqSchema = { "@context": CTX, ...faqNode };
  const articleSchema = { "@context": CTX, ...articleNode };
  const breadcrumbSchema = { "@context": CTX, ...breadcrumbNode };
  const videoSchema = videoNode ? { "@context": CTX, ...videoNode } : undefined;
  const softwareSchema = { "@context": CTX, ...softwareNode };

  // Blog-page @graph = content schemas only (Article + FAQ + Breadcrumb + the source Video).
  const graph: Record<string, unknown>[] = [articleNode, faqNode, breadcrumbNode];
  if (videoNode) graph.push(videoNode);
  const combined =
    `<script type="application/ld+json">\n` +
    JSON.stringify({ "@context": CTX, "@graph": graph }, null, 2) +
    `\n</script>`;

  return { faqSchema, articleSchema, breadcrumbSchema, videoSchema, softwareSchema, combined };
}

// Extract <dl><dt>q</dt><dd>a</dd></dl> FAQ pairs from generated blog HTML.
export function extractFaqPairs(html: string): [string, string][] {
  const pairs: [string, string][] = [];
  const dl = html.match(/<dl>([\s\S]*?)<\/dl>/i);
  if (dl) {
    const qs = [...dl[1].matchAll(/<dt>([\s\S]*?)<\/dt>/gi)].map((m) => m[1]);
    const as = [...dl[1].matchAll(/<dd>([\s\S]*?)<\/dd>/gi)].map((m) => m[1]);
    for (let i = 0; i < Math.min(qs.length, as.length); i++) {
      const q = qs[i].replace(/<[^>]+>/g, "").trim();
      const ans = as[i].replace(/<[^>]+>/g, "").trim();
      if (q && ans) pairs.push([q, ans]);
    }
  }
  return pairs.slice(0, 5);
}
