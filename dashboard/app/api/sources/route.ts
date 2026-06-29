import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { store, type StoredSource } from "@/lib/store";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    const sources = await store.listSources(user.id);
    return NextResponse.json({ sources });
  } catch (err: unknown) {
    return NextResponse.json({ error: dbMsg(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = await req.json();
    if (!body?.url || !body?.transcript) {
      return NextResponse.json({ error: "url and transcript are required." }, { status: 400 });
    }
    const source: StoredSource = {
      id: "src_" + randomBytes(8).toString("hex"),
      userId: user.id,
      url: String(body.url),
      videoId: body.videoId ?? null,
      title: String(body.title || "Untitled video"),
      transcript: String(body.transcript),
      transcriptLang: body.transcriptLang ? String(body.transcriptLang) : undefined,
      createdAt: new Date().toISOString(),
      outputs: {},
    };
    await store.createSource(source);
    return NextResponse.json({ source });
  } catch (err: unknown) {
    return NextResponse.json({ error: dbMsg(err) }, { status: 500 });
  }
}

function dbMsg(err: unknown): string {
  const m = err instanceof Error ? err.message : "unknown error";
  return `Could not reach the database (${m}). Make sure Postgres is running: npm run db`;
}
