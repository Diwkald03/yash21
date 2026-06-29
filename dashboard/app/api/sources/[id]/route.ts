import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownedSource(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  const source = await store.getSource(id);
  if (!source || source.userId !== user.id) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  return { user, source };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await ownedSource(params.id);
    if (error) return error;

    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (body.outputs !== undefined) patch.outputs = body.outputs;
    if (body.title !== undefined) patch.title = String(body.title);
    if (body.transcript !== undefined) patch.transcript = String(body.transcript);
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const updated = await store.updateSource(params.id, patch);
    if (!updated) {
      return NextResponse.json({ error: "Source was deleted during the update. Try again." }, { status: 404 });
    }
    return NextResponse.json({ source: updated });
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: `Could not save (${m}). Is Postgres running? npm run db` }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await ownedSource(params.id);
    if (error) return error;
    await store.deleteSource(params.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: `Could not delete (${m}).` }, { status: 500 });
  }
}
