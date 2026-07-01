/**
 * Storage layer — the single seam for persistence.
 *
 * Today it is backed by a local JSON file (zero-setup, multi-user, no Supabase).
 * To move to Supabase/Postgres later: implement the `Store` interface against
 * Supabase and swap the `store` export at the bottom. Nothing else changes.
 */
import { promises as fs } from "fs";
import { join, dirname } from "path";

export interface User {
  id: string;
  name: string;
  email: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface ResetCode {
  email: string;
  codeHash: string;
  expiresAt: string;
}

export interface StoredSource {
  id: string;
  userId: string;
  url: string;
  videoId: string | null;
  title: string;
  transcript: string;
  transcriptLang?: string;
  createdAt: string;
  outputs: Record<string, unknown>;
}

interface DB {
  users: User[];
  sessions: Session[];
  resetCodes: ResetCode[];
  sources: StoredSource[];
}

export interface Store {
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  createUser(u: User): Promise<User>;
  updateUser(id: string, patch: Partial<User>): Promise<void>;

  createSession(s: Session): Promise<void>;
  getSession(token: string): Promise<Session | null>;
  deleteSession(token: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;

  setResetCode(rc: ResetCode): Promise<void>;
  getResetCode(email: string): Promise<ResetCode | null>;
  deleteResetCode(email: string): Promise<void>;

  listSources(userId: string): Promise<StoredSource[]>;
  getSource(id: string): Promise<StoredSource | null>;
  createSource(s: StoredSource): Promise<StoredSource>;
  updateSource(id: string, patch: Partial<StoredSource>): Promise<StoredSource | null>;
  deleteSource(id: string): Promise<void>;

  listAllUsers(): Promise<User[]>;
  listAllSources(): Promise<StoredSource[]>;
}

// ── File-backed implementation ────────────────────────────────────────────────
const DB_PATH = join(process.cwd(), "data", "db.json");
const EMPTY: DB = { users: [], sessions: [], resetCodes: [], sources: [] };

// in-process write lock (dev is single-process; prevents read-modify-write races)
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn) as Promise<T>;
  chain = run.then(() => {}, () => {});
  return run;
}

async function load(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function save(db: DB): Promise<void> {
  await fs.mkdir(dirname(DB_PATH), { recursive: true });
  const tmp = DB_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_PATH);
}

class FileStore implements Store {
  async getUserByEmail(email: string) {
    const db = await load();
    return db.users.find((u) => u.email === email.toLowerCase()) || null;
  }
  async getUserById(id: string) {
    const db = await load();
    return db.users.find((u) => u.id === id) || null;
  }
  createUser(u: User) {
    return withLock(async () => {
      const db = await load();
      db.users.push(u);
      await save(db);
      return u;
    });
  }
  updateUser(id: string, patch: Partial<User>) {
    return withLock(async () => {
      const db = await load();
      const i = db.users.findIndex((u) => u.id === id);
      if (i >= 0) {
        db.users[i] = { ...db.users[i], ...patch };
        await save(db);
      }
    });
  }

  createSession(s: Session) {
    return withLock(async () => {
      const db = await load();
      db.sessions.push(s);
      await save(db);
    });
  }
  async getSession(token: string) {
    const db = await load();
    const s = db.sessions.find((x) => x.token === token) || null;
    if (s && new Date(s.expiresAt) < new Date()) return null;
    return s;
  }
  deleteSession(token: string) {
    return withLock(async () => {
      const db = await load();
      db.sessions = db.sessions.filter((s) => s.token !== token);
      await save(db);
    });
  }
  deleteSessionsForUser(userId: string) {
    return withLock(async () => {
      const db = await load();
      db.sessions = db.sessions.filter((s) => s.userId !== userId);
      await save(db);
    });
  }

  setResetCode(rc: ResetCode) {
    return withLock(async () => {
      const db = await load();
      db.resetCodes = db.resetCodes.filter((c) => c.email !== rc.email);
      db.resetCodes.push(rc);
      await save(db);
    });
  }
  async getResetCode(email: string) {
    const db = await load();
    const c = db.resetCodes.find((x) => x.email === email.toLowerCase()) || null;
    if (c && new Date(c.expiresAt) < new Date()) return null;
    return c;
  }
  deleteResetCode(email: string) {
    return withLock(async () => {
      const db = await load();
      db.resetCodes = db.resetCodes.filter((c) => c.email !== email.toLowerCase());
      await save(db);
    });
  }

  async listSources(userId: string) {
    const db = await load();
    return db.sources
      .filter((s) => s.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  async getSource(id: string) {
    const db = await load();
    return db.sources.find((s) => s.id === id) || null;
  }
  createSource(s: StoredSource) {
    return withLock(async () => {
      const db = await load();
      db.sources.push(s);
      await save(db);
      return s;
    });
  }
  updateSource(id: string, patch: Partial<StoredSource>) {
    return withLock(async () => {
      const db = await load();
      const i = db.sources.findIndex((s) => s.id === id);
      if (i < 0) return null;
      db.sources[i] = { ...db.sources[i], ...patch };
      await save(db);
      return db.sources[i];
    });
  }
  deleteSource(id: string) {
    return withLock(async () => {
      const db = await load();
      db.sources = db.sources.filter((s) => s.id !== id);
      await save(db);
    });
  }
  async listAllUsers() { return (await load()).users; }
  async listAllSources() { return (await load()).sources; }
}

// ── Postgres implementation (used when DATABASE_URL is set) ───────────────────
import { Pool } from "pg";

let _pool: Pool | null = null;
function pgPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      // Fail fast instead of hanging a request forever when the DB is unreachable or
      // wedged. Without these, a down Postgres makes /api/auth/register (and every other
      // DB call) hang indefinitely, so the UI never advances past the auth screen.
      connectionTimeoutMillis: 8000, // give up connecting after 8s
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,      // cap any single query at 15s
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
    // A pool 'error' on an idle client would otherwise crash the process; log and move on.
    _pool.on("error", (e) => console.error("pg pool error:", e.message));
  }
  return _pool;
}

let _ready: Promise<void> | null = null;
function pgReady(): Promise<void> {
  if (!_ready) {
    _ready = pgPool()
      .query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, salt TEXT,
          password_hash TEXT, created_at TIMESTAMPTZ DEFAULT now());
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY, user_id TEXT, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ);
        CREATE TABLE IF NOT EXISTS reset_codes (
          email TEXT PRIMARY KEY, code_hash TEXT, expires_at TIMESTAMPTZ);
        CREATE TABLE IF NOT EXISTS sources (
          id TEXT PRIMARY KEY, user_id TEXT, url TEXT, video_id TEXT, title TEXT,
          transcript TEXT, transcript_lang TEXT, created_at TIMESTAMPTZ DEFAULT now(),
          outputs JSONB DEFAULT '{}'::jsonb);
        CREATE INDEX IF NOT EXISTS sources_user_idx ON sources(user_id);
      `)
      .then(() => undefined);
  }
  return _ready;
}
async function pq(text: string, params: unknown[] = []) {
  await pgReady();
  return pgPool().query(text, params);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const rowUser = (r: any): User => ({
  id: r.id, name: r.name, email: r.email, salt: r.salt,
  passwordHash: r.password_hash, createdAt: new Date(r.created_at).toISOString(),
});
const rowSource = (r: any): StoredSource => ({
  id: r.id, userId: r.user_id, url: r.url, videoId: r.video_id, title: r.title,
  transcript: r.transcript, transcriptLang: r.transcript_lang || undefined,
  createdAt: new Date(r.created_at).toISOString(), outputs: r.outputs || {},
});

class PgStore implements Store {
  async getUserByEmail(email: string) {
    const r = await pq(`SELECT * FROM users WHERE email=$1`, [email.toLowerCase()]);
    return r.rows[0] ? rowUser(r.rows[0]) : null;
  }
  async getUserById(id: string) {
    const r = await pq(`SELECT * FROM users WHERE id=$1`, [id]);
    return r.rows[0] ? rowUser(r.rows[0]) : null;
  }
  async createUser(u: User) {
    await pq(`INSERT INTO users(id,name,email,salt,password_hash,created_at) VALUES($1,$2,$3,$4,$5,$6)`,
      [u.id, u.name, u.email, u.salt, u.passwordHash, u.createdAt]);
    return u;
  }
  async updateUser(id: string, patch: Partial<User>) {
    const f: string[] = []; const v: unknown[] = []; let i = 1;
    if (patch.salt !== undefined) { f.push(`salt=$${i++}`); v.push(patch.salt); }
    if (patch.passwordHash !== undefined) { f.push(`password_hash=$${i++}`); v.push(patch.passwordHash); }
    if (patch.name !== undefined) { f.push(`name=$${i++}`); v.push(patch.name); }
    if (!f.length) return;
    v.push(id);
    await pq(`UPDATE users SET ${f.join(",")} WHERE id=$${i}`, v);
  }
  async createSession(s: Session) {
    await pq(`INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES($1,$2,$3,$4)`,
      [s.token, s.userId, s.createdAt, s.expiresAt]);
  }
  async getSession(token: string) {
    const r = await pq(`SELECT * FROM sessions WHERE token=$1`, [token]);
    const s = r.rows[0];
    if (!s || new Date(s.expires_at) < new Date()) return null;
    return { token: s.token, userId: s.user_id, createdAt: new Date(s.created_at).toISOString(), expiresAt: new Date(s.expires_at).toISOString() };
  }
  async deleteSession(token: string) { await pq(`DELETE FROM sessions WHERE token=$1`, [token]); }
  async deleteSessionsForUser(userId: string) { await pq(`DELETE FROM sessions WHERE user_id=$1`, [userId]); }
  async setResetCode(rc: ResetCode) {
    await pq(`INSERT INTO reset_codes(email,code_hash,expires_at) VALUES($1,$2,$3)
      ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at`,
      [rc.email, rc.codeHash, rc.expiresAt]);
  }
  async getResetCode(email: string) {
    const r = await pq(`SELECT * FROM reset_codes WHERE email=$1`, [email.toLowerCase()]);
    const c = r.rows[0];
    if (!c || new Date(c.expires_at) < new Date()) return null;
    return { email: c.email, codeHash: c.code_hash, expiresAt: new Date(c.expires_at).toISOString() };
  }
  async deleteResetCode(email: string) { await pq(`DELETE FROM reset_codes WHERE email=$1`, [email.toLowerCase()]); }
  async listSources(userId: string) {
    const r = await pq(`SELECT * FROM sources WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    return r.rows.map(rowSource);
  }
  async getSource(id: string) {
    const r = await pq(`SELECT * FROM sources WHERE id=$1`, [id]);
    return r.rows[0] ? rowSource(r.rows[0]) : null;
  }
  async createSource(s: StoredSource) {
    await pq(`INSERT INTO sources(id,user_id,url,video_id,title,transcript,transcript_lang,created_at,outputs)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [s.id, s.userId, s.url, s.videoId, s.title, s.transcript, s.transcriptLang || null, s.createdAt, JSON.stringify(s.outputs || {})]);
    return s;
  }
  async updateSource(id: string, patch: Partial<StoredSource>) {
    const f: string[] = []; const v: unknown[] = []; let i = 1;
    if (patch.outputs !== undefined) { f.push(`outputs=$${i++}`); v.push(JSON.stringify(patch.outputs)); }
    if (patch.title !== undefined) { f.push(`title=$${i++}`); v.push(patch.title); }
    if (patch.transcript !== undefined) { f.push(`transcript=$${i++}`); v.push(patch.transcript); }
    if (!f.length) return this.getSource(id);
    v.push(id);
    const r = await pq(`UPDATE sources SET ${f.join(",")} WHERE id=$${i} RETURNING *`, v);
    return r.rows[0] ? rowSource(r.rows[0]) : null;
  }
  async deleteSource(id: string) { await pq(`DELETE FROM sources WHERE id=$1`, [id]); }
  async listAllUsers() { const r = await pq(`SELECT * FROM users ORDER BY created_at DESC`); return r.rows.map(rowUser); }
  async listAllSources() { const r = await pq(`SELECT * FROM sources ORDER BY created_at DESC`); return r.rows.map(rowSource); }
}

// Postgres when DATABASE_URL is configured, else the zero-setup file store.
export const store: Store = process.env.DATABASE_URL ? new PgStore() : new FileStore();
export const storeBackend = process.env.DATABASE_URL ? "postgres" : "file";
