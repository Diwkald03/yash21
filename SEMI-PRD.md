# DeoDap — YouTube → Shopify Blog Automation · Semi-PRD

**Status:** building · **Target:** wire transcript → blog → **Shopify draft** before finalize.

## Objective
Convert DeoDap YouTube videos into fully optimized, human-like, SEO-friendly Shopify
blog posts and stage them as **drafts** in Shopify automatically — minimal manual work,
high content quality, SEO standards, product accuracy, and brand consistency.

> First deliverable: an **AI transcript tool** that gives accurate results from our videos.

## Desired process (each step = one module/route)
| # | Step | Where it lives | Status |
|---|------|----------------|--------|
| 1 | AI reads/transcribes the YouTube video | `api/transcript` (yt-dlp + InnerTube/HTML fallback) → `lib/transcriptFormat` prettifies | Done |
| 2 | AI understands topic & intent | `api/analyze` (Claude Sonnet 4.6 / local fallback) | Done |
| 3 | AI fetches relevant **products & collections from Shopify** | `api/shopify/products` (Shopify GraphQL Admin API; demo fallback) | Done |
| 4 | AI writes a complete SEO blog | `api/generate` (Claude Opus 4.8 / local template) | Done |
| 5 | AI inserts product images, descriptions, internal links, CTAs | blog generator (product cards, `/products/{handle}`, `/collections/{handle}`, CTA block) | Done |
| 6 | AI generates SEO metadata, schema, FAQ schema | `lib/localAnalyze` → SEO pack + FAQ/Article JSON-LD | Done |
| 7 | AI **wires the blog into the Shopify Blog section as a DRAFT** | `api/publish` → `lib/shopify.createDraftArticle` (`published:false`) | Done |

**Finalize rule:** the system never auto-publishes. It creates a **draft** in Shopify; a
human reviews it in Shopify Admin and clicks Publish — the only manual step.

## AI must understand (surfaced in the "AI Analysis" card)
- **Main topic** · **Products shown** · **Collections discussed**
- **Problem being solved** · **Buying intent** (low/med/high) · **Search intent**

## Database (server-based Postgres)
Run a real Postgres locally with **no Docker / no cloud account**:
```
cd dashboard
npm run db        # starts Postgres, prints the accessible URL
```
Then set in `dashboard/.env.local`:
```
DATABASE_URL=postgresql://deodap:deodap@localhost:54329/deodap
```
Tables (`users`, `sessions`, `reset_codes`, `sources`) are created automatically.
Swap the URL for a cloud Postgres (Neon/Railway/Supabase) later — no code change
(`PGSSL=true` for cloud). Leave `DATABASE_URL` blank to use the local JSON file store.

## Shopify status: dummy mode (for now)
No live admin token is wired yet, so the Draft step runs in **demo mode** — it produces
a draft link for review without touching a real store. Add `SHOPIFY_ADMIN_TOKEN` later
and the exact same flow creates a real Shopify draft (no code change).

## Connecting Shopify (to make drafts go live)
Add to `dashboard/.env.local`:
```
SHOPIFY_STORE_URL=https://<your-store>.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_...        # scopes: read_products, read_content, write_content
SHOPIFY_BLOG_ID=                     # optional; auto-uses the first blog
```
Find the blog id via `GET /api/shopify/status` (lists blogs). Without a token the app
runs in **demo mode** (everything works; the draft step returns a demo link).

## UI / UX contract
- 3-column NotebookLM layout (Sources · Chat · Studio), responsive (stacks ≤980px).
- Clean SVG icons, no emojis. Studio cards always clickable; logical order:
  Analysis → Blog → SEO → FAQ Schema → Article Schema → Featured Image → **Publish**.
- Header shows **Claude** and **Shopify** connection status.
- Multi-user: register/login, password reset via Gmail; data persisted per user
  behind a Supabase-swappable `Store` interface.
