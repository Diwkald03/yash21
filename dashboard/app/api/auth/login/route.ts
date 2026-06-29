import { NextRequest, NextResponse } from "next/server";
import { authenticate, toSafeUser } from "@/lib/auth";
import { createSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const user = await authenticate(email, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  await createSessionCookie(user.id);
  return NextResponse.json({ user: toSafeUser(user) });
}
