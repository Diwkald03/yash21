import { NextResponse } from "next/server";
import { shopifyConfigured, shopifyStore, listBlogs } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = shopifyConfigured();
  if (!configured) {
    return NextResponse.json({ configured: false, store: shopifyStore(), blogs: [] });
  }
  try {
    const blogs = await listBlogs();
    return NextResponse.json({
      configured: true,
      store: shopifyStore(),
      blogId: process.env.SHOPIFY_BLOG_ID || (blogs[0] ? String(blogs[0].id) : ""),
      blogs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ configured: true, store: shopifyStore(), blogs: [], error: message });
  }
}
