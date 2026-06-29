import { NextRequest, NextResponse } from "next/server";
import { consumeResetCode } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { email, code, password } = await req.json();
  if (!email || !code || !password) {
    return NextResponse.json({ error: "Email, code and new password are required." }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  const ok = await consumeResetCode(email, String(code).trim(), password);
  if (!ok) {
    return NextResponse.json({ error: "Invalid or expired reset code." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
