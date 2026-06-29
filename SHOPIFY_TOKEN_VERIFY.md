# ✅ Shopify Token — Find It & Verify It's Correct

Use this sheet to confirm the token your senior gives you is **(A) the right TYPE** and **(B) actually works**.

---

## A. Is it the RIGHT token? (format check — 5 seconds)

| Check | Correct ✅ | Wrong ❌ |
|---|---|---|
| **Prefix** | starts with **`shpat_`** | `shpss_` (secret key), `shpca_`, `shppa_` |
| **Where it came from** | **API credentials** tab → "Admin API access token" → *Reveal token once* | "API secret key" field, or the "API key" field |
| **Length** | ~38 characters (`shpat_` + 32 hex chars) | much shorter / has spaces |
| **Shown** | only **once** (after Install app) | shown repeatedly = probably the API key, not the token |

> 🔑 Rule of thumb: **`shpat_` = correct.** Anything else = wrong field, go back to **API credentials → Admin API access token**.

---

## B. Does it WORK? (live test — 30 seconds)

Open **PowerShell**, paste the two values, and run this. It asks Shopify "who am I?" using the token:

```powershell
$token = "shpat_PASTE_YOURS_HERE"
$store = "your-store.myshopify.com"        # e.g. deodap.myshopify.com
Invoke-RestMethod -Uri "https://$store/admin/api/2024-01/shop.json" -Headers @{ "X-Shopify-Access-Token" = $token }
```

**Read the result:**
- ✅ **PASS** → it prints your shop details (name, domain, email). The token is **valid and live**.
- ❌ **`401 Unauthorized`** → token is wrong, mistyped, or the app was uninstalled.
- ❌ **`404 Not Found`** → the **store URL** is wrong (check the `your-store.myshopify.com` part).

---

## C. Do the 3 permissions work? (scope test — optional, 20 seconds)

Confirms `read_products` + `read_content`/`write_content` are actually enabled:

```powershell
# read_products  → should return a product
Invoke-RestMethod -Uri "https://$store/admin/api/2024-01/products.json?limit=1" -Headers @{ "X-Shopify-Access-Token" = $token }

# read_content   → should list the store's blog(s)
Invoke-RestMethod -Uri "https://$store/admin/api/2024-01/blogs.json" -Headers @{ "X-Shopify-Access-Token" = $token }
```

- ✅ Both return data → scopes are correct, ready to wire.
- ❌ `403 Forbidden` on either → that scope wasn't ticked; redo **Configuration → Admin API → Configure** and re-tick the 3 permissions.

---

## D. Then send me
```
shpat_xxxxxxxxxxxxxxxxxxxx
https://<your-store>.myshopify.com
```
**Or just paste them in chat and I'll run all 3 checks above for you in 30 seconds** and confirm it's good before wiring it live.
