# 🟢 Get the Shopify Token — Super Simple Steps (just follow & click)

**Goal:** copy ONE secret code that starts with `shpat_` and send it back.
**Time:** about 5 minutes. **No coding. Just clicking.**

---

## PART A — Open the right page

1. Open your web browser (Chrome).
2. Go to your Shopify store admin → log in.
3. Look at the **bottom-left corner**. Click **⚙️ Settings**.
4. In the menu that opens, click **Apps and sales channels**.
5. On that page, look at the **top-right**. Click the button **Develop apps**.
   - 👉 If a blue box pops up, click **Allow custom app development**, then click **Confirm**.
   - 👉 If you do NOT see "Develop apps", you don't have permission — only the **Store Owner** can do this part.

---

## PART B — Make the app

6. Click the button **Create an app** (top-right).
7. A small box asks for a name. Type exactly: **`DeoDap Blog Drafter`**
8. Click **Create app**.

---

## PART C — ⭐ Turn ON the 3 permissions (THE IMPORTANT PART)

9. Now you see tabs near the top. Click the tab **Configuration**.
10. Find the section **Admin API integration**. Next to it, click the **Configure** button.
11. A page opens with a **search box** and a long list of permissions (called "scopes").

### Now add the 3 permissions, one by one:

12. Click in the **search box** and type:  **`read_products`**
    - A result appears with a small **checkbox** ☐ on the left.
    - **Click that checkbox** so it becomes ticked ✅.

13. **Delete** what you typed. Now type:  **`read_content`**
    - Click its **checkbox** ✅.

14. **Delete** again. Now type:  **`write_content`**
    - Click its **checkbox** ✅.

✅ You should now have **3 boxes ticked**: `read_products`, `read_content`, `write_content`.

15. Click the **Save** button (top-right of that page).

> Picture of what "done" looks like:
> ```
> ☑ read_products
> ☑ read_content
> ☑ write_content
> ```
> (Only these 3. Nothing else needs ticking.)

---

## PART D — Install & copy the secret code

16. Go back to the top and click **Install app** (top-right) → click **Install** in the pop-up.
17. Now click the tab **API credentials**.
18. Find the line **Admin API access token**. Click **Reveal token once**.
19. A code starting with **`shpat_`** appears. **Copy it.**
    - ⚠️ It shows **only ONE time**. If you close the page, you must make a new one.

---

## PART E — Send it back

20. Send me these **two** lines:

```
shpat_xxxxxxxxxxxxxxxxxxxxxxxx
https://<your-store-name>.myshopify.com
```

---

## ❗ One thing to double-check
- The correct code starts with **`shpat_`** ✅
- If you see a code that starts with **`shpss_`** ❌ — that's the WRONG one (it's the "secret key"). Go back to **API credentials** and copy the **Admin API access token** instead.

**That's all. Copy the `shpat_` code → send it → done. 🎉**
