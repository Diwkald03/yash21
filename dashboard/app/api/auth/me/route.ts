import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { toSafeUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user: user ? toSafeUser(user) : null });
}
