import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getCurrentUser } from "@/lib/session";
import { shopifyConfigured, shopifyStore, createDraftArticle } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stage 07 — wire the finished blog into Shopify as a DRAFT for human review.
export async function POST(req: NextRequest) {
  try {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { sourceId } = await req.json();
  const source = await store.getSource(String(sourceId || ""));
  if (!source || source.userId !== user.id) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 });
  }

  const out = source.outputs as Record<string, any>;
  if (!out?.blogHtml) {
    return NextResponse.json({ error: "Generate the blog first." }, { status: 400 });
  }

  const seo = out.seo || {};
  const analysis = out.analysis || {};
  const products = (out.shopify || []) as { image_src?: string }[];
  const title = seo.seoTitle || out.blogTitle || analysis.primary_keyword || "DeoDap Blog Post";
  const tags = ((analysis.secondary_keywords as string[]) || []).slice(0, 8).join(", ");
  const imageSrc = products.find((p) => p.image_src)?.image_src || "";

  let draftUrl = "";
  let articleId: number | string | null = null;
  let simulated = true;

  if (shopifyConfigured()) {
    try {
      const res = await createDraftArticle({
        title,
        bodyHtml: out.blogHtml,
        tags,
        summaryHtml: seo.metaDesc ? `<p>${seo.metaDesc}</p>` : "",
        seoTitle: seo.seoTitle,
        metaDesc: seo.metaDesc,
        imageSrc,
        primaryKeyword: analysis.primary_keyword,
      });
      draftUrl = res.adminUrl;
      articleId = res.id;
      simulated = false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: `Shopify draft failed: ${message}` }, { status: 502 });
    }
  } else {
    // demo fallback so the flow works before Shopify credentials are added
    const store_ = shopifyStore() || "https://grabnix.myshopify.com";
    articleId = 8000000000 + (String(title).length * 9173) % 999999;
    draftUrl = `${store_}/admin/articles/${articleId}`;
  }

  const updated = await store.updateSource(source.id, {
    outputs: { ...out, published: draftUrl, shopifyArticleId: articleId, publishSimulated: simulated },
  });
  if (!updated) {
    return NextResponse.json({ error: "Source was deleted during publish. Try again." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, draftUrl, articleId, simulated, source: updated });
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: `Publish failed (${m}). Is Postgres running? npm run db` }, { status: 500 });
  }
}
