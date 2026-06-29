/**
 * Local server-based Postgres (no Docker, no cloud account needed) — a real
 * Postgres process you can connect to via a URL. Dummy/dev for now; swap the URL
 * for a cloud Postgres (Neon/Railway/etc.) later without any code change.
 *
 *   npm run db          # starts Postgres, prints the DATABASE_URL
 *
 * Then put that URL in .env.local as DATABASE_URL and run `npm run dev`.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "fs";
import { join } from "path";

const DIR = join(process.cwd(), "data", "pgdata");
const PORT = Number(process.env.DB_PORT || 54329);
const USER = "deodap";
const PASSWORD = "deodap";
const DATABASE = "deodap";

const pg = new EmbeddedPostgres({
  databaseDir: DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // UTF8 so Hindi/Hinglish/Indian-language transcripts store correctly
  // (Windows initdb otherwise defaults to WIN1252 and rejects Devanagari).
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

const fresh = !existsSync(join(DIR, "PG_VERSION"));

try {
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) {
    try { await pg.createDatabase(DATABASE); } catch { /* already exists */ }
  }
} catch (err) {
  console.error("Failed to start Postgres:", err);
  process.exit(1);
}

const url = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;
console.log("\n────────────────────────────────────────────────────────");
console.log("  DeoDap Postgres is running.");
console.log("  Accessible URL (put this in .env.local as DATABASE_URL):");
console.log("  " + url);
console.log("────────────────────────────────────────────────────────\n");
console.log("Leave this running. Ctrl+C to stop.");

async function shutdown() {
  try { await pg.stop(); } catch { /* ignore */ }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
