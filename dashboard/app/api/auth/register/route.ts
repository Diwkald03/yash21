import { NextRequest, NextResponse } from "next/server";
import { registerUser, authenticate, isValidEmail, toSafeUser } from "@/lib/auth";
import { createSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();
  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email and password are required." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  try {
    await registerUser(name, email, password);
    const user = await authenticate(email, password);
    if (!user) throw new Error("Registration failed.");
    await createSessionCookie(user.id);
    return NextResponse.json({ user: toSafeUser(user) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Registration failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
