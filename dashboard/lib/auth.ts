/** Auth utilities — password hashing, user creation, and reset codes. */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { store, type User } from "./store";

export function hashPassword(password: string, salt?: string) {
  const s = salt || randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64).toString("hex");
  return { salt: s, passwordHash: hash };
}

export function verifyPassword(password: string, salt: string, expected: string): boolean {
  const hash = scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export function toSafeUser(u: User): SafeUser {
  return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt };
}

export async function registerUser(name: string, email: string, password: string): Promise<User> {
  const lower = email.toLowerCase();
  const existing = await store.getUserByEmail(lower);
  if (existing) throw new Error("An account with this email already exists.");
  const { salt, passwordHash } = hashPassword(password);
  const user: User = {
    id: "usr_" + randomBytes(8).toString("hex"),
    name: name.trim(),
    email: lower,
    salt,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  return store.createUser(user);
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const user = await store.getUserByEmail(email.toLowerCase());
  if (!user) return null;
  return verifyPassword(password, user.salt, user.passwordHash) ? user : null;
}

// ── password reset codes ──────────────────────────────────────────────────────
export function generateResetCode(): string {
  return String(Math.floor(100000 + (randomBytes(4).readUInt32BE(0) % 900000)));
}
export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function createResetCode(email: string): Promise<string> {
  const code = generateResetCode();
  await store.setResetCode({
    email: email.toLowerCase(),
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
  });
  return code;
}

export async function consumeResetCode(email: string, code: string, newPassword: string): Promise<boolean> {
  const rc = await store.getResetCode(email.toLowerCase());
  if (!rc) return false;
  const ok = timingSafeEqual(
    Buffer.from(rc.codeHash, "hex"),
    Buffer.from(hashCode(code), "hex"),
  );
  if (!ok) return false;
  const user = await store.getUserByEmail(email.toLowerCase());
  if (!user) return false;
  const { salt, passwordHash } = hashPassword(newPassword);
  await store.updateUser(user.id, { salt, passwordHash });
  await store.deleteResetCode(email.toLowerCase());
  await store.deleteSessionsForUser(user.id); // force re-login everywhere
  return true;
}
