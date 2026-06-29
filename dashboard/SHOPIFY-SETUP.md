# Wire the app to Shopify (free dummy store → real drafts)

Right now the app works **hands-on in demo mode**: click "Draft Blog to Shopify" and
you get a demo draft link — no setup. To make it create **real drafts in a Shopify
admin you can open**, connect a free **development (dummy) store**. ~5 minutes.

## 1. Create a free dummy store (Shopify Partners — free, unlimited)
1. Go to https://partners.shopify.com → **Sign up** (free).
2. In the Partner dashboard → **Stores → Add store → Create development store**.
   - Type: "Create a store to test and build". Give it a name (e.g. `deodap-dev`).
3. You now have a free store at `https://<your-store>.myshopify.com` with dummy data.

> A development store never charges and is meant for exactly this kind of testing.

## 2. Get an Admin API token from that store
1. Open the dev store admin → **Settings → Apps and sales channels → Develop apps**.
   (If prompted, click **Allow custom app development**.)
2. **Create an app** → name it `DeoDap Blog Drafter`.
3. **Configuration → Admin API integration → Configure** → enable scopes:
   - `read_products`
   - `read_content`
   - `write_content`
   - Save.
4. **API credentials → Install app** → reveal the **Admin API access token** (`shpat_…`).

## 3. Put the credentials in the app
Edit `dashboard/.env.local`:
```
SHOPIFY_STORE_URL=https://<your-store>.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxx
SHOPIFY_BLOG_ID=        # leave blank — it auto-uses the store's first blog
```
Restart the app (`npm run dev:https`).

## 4. Confirm it's live
- The header flips from **"Shopify demo"** to **"Shopify"** (green dot).
- Visit `https://localhost:3000/api/shopify/status` — it lists your store's blogs.
- Draft a blog → the **Products** tab shows your real catalog, and **Publish** creates
  a real **draft** article (never auto-published) in the dev store's **Blog posts**.

## Notes
- It stays a **draft** for human review — the only manual step, by design.
- Your dev store has sample products; add a few of your own to see product matching.
- When you're ready for the real DeoDap store, swap `SHOPIFY_STORE_URL` +
  `SHOPIFY_ADMIN_TOKEN` for that store's values — no code change.
