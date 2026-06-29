/** Session cookie management — server-side sessions, httpOnly cookie. */
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { store, type User } from "./store";

const COOKIE = "deodap_sid";
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days (seconds)

export async function createSessionCookie(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await store.createSession({
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + MAX_AGE * 1000).toISOString(),
  });
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySessionCookie(): Promise<void> {
  const token = cookies().get(COOKIE)?.value;
  if (token) await store.deleteSession(token);
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
}

export async function getCurrentUser(): Promise<User | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const session = await store.getSession(token);
  if (!session) return null;
  return store.getUserById(session.userId);
}
