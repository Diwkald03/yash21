/**
 * Production HTTPS server for the built app (next start has no HTTPS).
 *   npm run build && npm run start:https   →   https://localhost:3000  (fast + secure)
 * Uses the self-signed cert in certificates/ (generate via the dev:https flow).
 */
import { createServer } from "https";
import { readFileSync } from "fs";
import next from "next";

const port = Number(process.env.PORT || 3000);
const app = next({ dev: false });
const handle = app.getRequestHandler();

const opts = {
  key: readFileSync("certificates/localhost-key.pem"),
  cert: readFileSync("certificates/localhost.pem"),
};

await app.prepare();
createServer(opts, (req, res) => handle(req, res)).listen(port, () => {
  console.log(`Production HTTPS ready → https://localhost:${port}`);
});
