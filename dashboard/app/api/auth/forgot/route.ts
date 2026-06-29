import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { createResetCode } from "@/lib/auth";
import { sendResetCode, emailConfigured } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const user = await store.getUserByEmail(String(email).toLowerCase());
  // Always respond the same way so we don't reveal whether an account exists.
  if (!user) {
    return NextResponse.json({ ok: true, emailed: emailConfigured() });
  }

  const code = await createResetCode(user.email);
  const { sent } = await sendResetCode(user.email, code);

  // In dev without Gmail configured, return the code so the flow is testable.
  const body: Record<string, unknown> = { ok: true, emailed: sent };
  if (!sent && process.env.NODE_ENV !== "production") body.devCode = code;
  return NextResponse.json(body);
}
