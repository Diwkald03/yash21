import { NextRequest, NextResponse } from "next/server";
import { store, storeBackend } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Read-only data viewer for the operator. Protected by ADMIN_KEY (.env.local). */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || "";
  const expected = process.env.ADMIN_KEY;
  if (!expected) {
    return NextResponse.json({ error: "Set ADMIN_KEY in dashboard/.env.local to use the data viewer." }, { status: 403 });
  }
  if (key !== expected) {
    return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  }

  const users = await store.listAllUsers();
  const sources = await store.listAllSources();

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    drafts: sources
      .filter((s) => s.userId === u.id)
      .map((s) => {
        const o = (s.outputs || {}) as Record<string, unknown>;
        return {
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
          videoId: s.videoId,
          hasBlog: Boolean(o.blogHtml),
          published: (o.published as string) || null,
          simulated: (o.publishSimulated as boolean) ?? null,
        };
      }),
  }));

  return NextResponse.json({
    db: storeBackend,
    userCount: users.length,
    sourceCount: sources.length,
    users: rows,
  });
}
