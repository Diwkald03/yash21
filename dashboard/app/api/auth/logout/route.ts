import { NextResponse } from "next/server";
import { destroySessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await destroySessionCookie();
  return NextResponse.json({ ok: true });
}
