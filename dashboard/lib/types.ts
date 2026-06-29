export interface Collection {
  name: string;
  handle: string;
}

// A single product the video talks about, extracted straight from the transcript
// (NotebookLM-style — name + price + one-line utility). The full list is uncapped.
export interface VideoProduct {
  name: string;
  price?: string;    // as spoken in the video, e.g. "98"
  utility?: string;  // one line: what it's for / its key feature
}

export interface Analysis {
  topic: string;
  intent: "informational" | "commercial" | "transactional";
  buying_intent: "low" | "medium" | "high";
  target_audience: string;
  problem_solved: string;
  products: string[];          // flat names (derived from catalog) — used by blog + chips
  catalog?: VideoProduct[];    // EVERY product shown in the video, in order, no limit
  collections: Collection[];
  primary_keyword: string;
  secondary_keywords: string[];
  key_points: string[];
  engine: "claude" | "local";
}

export interface ShopifyProduct {
  title: string;
  handle: string;
  price: number;
  image_color?: string;
  product_type?: string;
  // enrichment (real deodap.in data + transcript utility)
  image_src?: string;     // real product image
  url?: string;           // canonical product URL
  description?: string;   // store/transcript description
  utility?: string;       // one-line use from the video
  rating?: number;        // Judge.me aggregateRating value (e.g. 3.75)
  reviewCount?: number;   // number of reviews
  storePrice?: number;    // current deodap.in price (may differ from the video price)
  matched?: boolean;      // true if found on deodap.in (false = transcript-only)
}

export interface SeoPack {
  seoTitle: string;
  metaDesc: string;
  slug: string;
  canonical: string;
  focusKeyword: string;
  keywords: string[];
  robots: string;
  imageUrl: string;
  imageAlt: string;
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
  wordCount: number;
  readingTime: number;
  metaTags: string; // ready-to-paste <title>/<meta>/<link> block
  featuredColor: string;
}

export interface SchemaPack {
  faqSchema: Record<string, unknown>;
  articleSchema: Record<string, unknown>;
  breadcrumbSchema: Record<string, unknown>;
  videoSchema?: Record<string, unknown>;     // VideoObject — the source YouTube video (active rich result)
  softwareSchema?: Record<string, unknown>;  // SoftwareApplication — the tool's identity (for its landing page)
  combined: string; // single <script type="application/ld+json"> @graph block (blog page)
}

export interface SourceOutputs {
  analysis?: Analysis;
  shopify?: ShopifyProduct[];
  blogTitle?: string;
  blogHtml?: string;
  seo?: SeoPack;
  schema?: SchemaPack;
  published?: string;
  publishSimulated?: boolean;
}

export interface Source {
  id: string;
  url: string;
  videoId: string | null;
  title: string;
  transcript: string;
  createdAt: string;
  outputs: SourceOutputs;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}
