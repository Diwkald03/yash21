/**
 * Shopify Admin API integration.
 *
 * Reads relevant products/collections (GraphQL Admin API full-text search) and
 * creates the blog post as a DRAFT article (REST Admin API, published:false) so a
 * human reviews it in Shopify before it goes live — per the PRD.
 *
 * Configure in dashboard/.env.local:
 *   SHOPIFY_STORE_URL=https://your-store.myshopify.com
 *   SHOPIFY_ADMIN_TOKEN=shpat_xxx        (Admin API access token; scopes:
 *                                          read_products, read_content, write_content)
 *   SHOPIFY_BLOG_ID=123456789            (optional — auto-uses the first blog if unset)
 *
 * If not configured, callers fall back to demo data so the app still runs.
 */
const API_VERSION = "2024-01";

function cfg() {
  const store = (process.env.SHOPIFY_STORE_URL || "").replace(/\/+$/, "");
  const token = process.env.SHOPIFY_ADMIN_TOKEN || "";
  const blogId = process.env.SHOPIFY_BLOG_ID || "";
  return { store, token, blogId };
}

export function shopifyConfigured(): boolean {
  const { store, token } = cfg();
  return Boolean(store && token);
}
export function shopifyStore(): string {
  return cfg().store;
}

async function rest(path: string, method = "GET", body?: unknown) {
  const { store, token } = cfg();
  const res = await fetch(`${store}/admin/api/${API_VERSION}${path}`, {
    method,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) {
    const detail = json ? JSON.stringify((json as { errors?: unknown }).errors ?? json) : text.slice(0, 200);
    throw new Error(`Shopify ${res.status}: ${detail}`);
  }
  return json as Record<string, unknown>;
}

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const { store, token } = cfg();
  const res = await fetch(`${store}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error("Shopify GraphQL: " + JSON.stringify(json.errors).slice(0, 200));
  if (!json.data) throw new Error("Shopify GraphQL: empty response");
  return json.data;
}

export interface SfProduct {
  title: string;
  handle: string;
  product_type: string;
  image_src: string;
  price: number;
}
export interface SfCollection {
  name: string;
  handle: string;
}

export async function searchProducts(name: string, limit = 3): Promise<SfProduct[]> {
  const data = await graphql<{
    products: { edges: { node: {
      title: string; handle: string; productType: string;
      featuredImage: { url: string } | null;
      priceRangeV2: { minVariantPrice: { amount: string } } | null;
    } }[] };
  }>(
    `query($q:String!,$n:Int!){ products(first:$n, query:$q){ edges{ node{
       title handle productType featuredImage{ url }
       priceRangeV2{ minVariantPrice{ amount } } } } } }`,
    { q: name, n: limit },
  );
  return (data.products.edges || []).map((e) => ({
    title: e.node.title,
    handle: e.node.handle,
    product_type: e.node.productType || "",
    image_src: e.node.featuredImage?.url || "",
    price: Math.round(Number(e.node.priceRangeV2?.minVariantPrice?.amount || 0)),
  }));
}

export async function searchCollections(name: string, limit = 2): Promise<SfCollection[]> {
  const data = await graphql<{ collections: { edges: { node: { title: string; handle: string } }[] } }>(
    `query($q:String!,$n:Int!){ collections(first:$n, query:$q){ edges{ node{ title handle } } } }`,
    { q: name, n: limit },
  );
  return (data.collections.edges || []).map((e) => ({ name: e.node.title, handle: e.node.handle }));
}

export async function listBlogs(): Promise<{ id: number; title: string; handle: string }[]> {
  const data = await rest("/blogs.json");
  const blogs = (data.blogs as { id: number; title: string; handle: string }[]) || [];
  return blogs.map((b) => ({ id: b.id, title: b.title, handle: b.handle }));
}

export interface DraftArticleInput {
  title: string;
  bodyHtml: string;
  author?: string;
  tags?: string;
  summaryHtml?: string;
  seoTitle?: string;
  metaDesc?: string;
  imageSrc?: string;
  primaryKeyword?: string;
}

export async function createDraftArticle(input: DraftArticleInput) {
  let { blogId } = cfg();
  if (!blogId) {
    const blogs = await listBlogs();
    if (!blogs.length) throw new Error("No blogs exist in this Shopify store — create one in Admin → Blog posts.");
    blogId = String(blogs[0].id);
  }

  const article: Record<string, unknown> = {
    title: input.title,
    author: input.author || "DeoDap Team",
    body_html: input.bodyHtml,
    tags: input.tags || "",
    published: false, // ALWAYS a draft — never auto-publish
    summary_html: input.summaryHtml || "",
  };
  if (input.imageSrc) article.image = { src: input.imageSrc, alt: input.primaryKeyword || input.title };

  const metafields: Record<string, unknown>[] = [];
  if (input.seoTitle) metafields.push({ namespace: "global", key: "title_tag", value: input.seoTitle, type: "single_line_text_field" });
  if (input.metaDesc) metafields.push({ namespace: "global", key: "description_tag", value: input.metaDesc, type: "single_line_text_field" });
  if (metafields.length) article.metafields = metafields;

  const data = await rest(`/blogs/${blogId}/articles.json`, "POST", { article });
  const a = data.article as { id: number; handle: string; published_at: string | null };
  const { store } = cfg();
  return {
    id: a.id,
    handle: a.handle,
    blogId,
    adminUrl: `${store}/admin/articles/${a.id}`,
    status: a.published_at ? "published" : "draft",
  };
}
