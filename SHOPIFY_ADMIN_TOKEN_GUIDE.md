# How to Generate the Shopify Admin API Access Token (`shpat_…`)
### For: the DeoDap Blog Drafter automation · Prepared for store-team & senior review

---

## 1. What is being requested, and why

The DeoDap Blog Drafter tool turns a YouTube product video into an SEO blog and **creates that blog as a DRAFT inside the Shopify store** for a human to review before publishing.

To do that securely, it needs **one credential**: a **Shopify Admin API access token** (a string that begins with **`shpat_`**).

- It is used **server-side only** — never exposed in a browser.
- Blogs are always created as **drafts** (`published: false`) — nothing goes live automatically.
- The token can be **revoked anytime** by uninstalling the app.

---

## 2. Why it may be "inaccessible" (important)

The token lives under **Settings → Apps and sales channels → Develop apps**. That area is only visible to:

- the **Store Owner**, **or**
- a **staff member / collaborator who has been granted the "Develop apps" permission**.

👉 If you don't see **"Develop apps"**, you don't have the permission yet — the **Store Owner must enable it once** (Step 3 below) or grant it to your account. This is the usual reason it "can't be accessed."

---

## 3. Step-by-step (the person with access follows this)

| # | Action |
|---|--------|
| 1 | Log in to the Shopify admin: `https://<store-name>.myshopify.com/admin` (or admin.shopify.com). |
| 2 | Bottom-left → **Settings** → **Apps and sales channels**. |
| 3 | Click **Develop apps** (top-right). If prompted, click **Allow custom app development** → **Confirm** *(Store Owner, one-time only)*. |
| 4 | Click **Create an app** → name it **`DeoDap Blog Drafter`** → **Create app**. |
| 5 | Open the **Configuration** tab → **Admin API integration → Configure** → enable exactly these 3 scopes, then **Save**:  `read_products`, `read_content`, `write_content`. |
| 6 | Top-right → **Install app** → **Install**. |
| 7 | Open the **API credentials** tab → under **Admin API access token** click **Reveal token once** → **copy it**. ⚠️ It is shown **only once**. |
| 8 | Note the **store URL** too: `https://<store-name>.myshopify.com`. |

---

## 4. What to send back

Please share these **two** items (securely — see Section 5):

```
Admin API access token : shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Store URL              : https://<store-name>.myshopify.com
```

That's all that's needed — the tool finds the blog automatically.

---

## 5. Security & scope notes (for senior review)

- **Least privilege:** only 3 scopes are requested:
  - `read_products` — to match video products to real store items (image, price, link).
  - `read_content` — to locate the store's blog to post into.
  - `write_content` — to create the **draft** blog article.
- **No access** to orders, customers, payments, inventory, or settings.
- The token is a secret (treat like a password). Share via a **private/secure channel**, not a public chat or screenshot.
- **Drafts only** — every post is `published: false`; a human approves before it goes live.
- **Revocable** — uninstalling the "DeoDap Blog Drafter" app instantly invalidates the token.
- Stored **server-side** in an environment variable (`SHOPIFY_ADMIN_TOKEN`); never sent to any browser.

---

## 6. Quick FAQ

- **Does this change the live store?** No — it only creates *drafts* for review.
- **What if the token leaks?** Uninstall the app; the token dies immediately. Generate a new one anytime.
- **Token format check:** a valid token starts with **`shpat_`**. If you got something starting with `shpss_` that's the *API secret key* (wrong one) — the needed one is the **Admin API access token** under *API credentials* (Step 7).
