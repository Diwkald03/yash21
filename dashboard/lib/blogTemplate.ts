import type { Analysis, ShopifyProduct } from "./types";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function cap(s: string): string {
  const t = (s || "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

// Deterministic fallback blog generator — used when no LLM key is set OR the LLM is rate-limited/failing
// (e.g. free-tier 429). Produces DeoDap's REAL published-blog style (a NUMBERED listicle): numbered
// product sections, each with an opening sentence + 5-7 benefit bullets + a "Shop Now →" link, a
// "Final Thoughts" close, and a 5-6 question FAQ. This keeps the output matching the live deodap.in
// blogs even when the free LLM tier is unavailable. Uses the REAL product image when one was enriched.
export function localBlog(a: Analysis, products: ShopifyProduct[]): { title: string; html: string } {
  const kw = a.primary_keyword;
  const coll = a.collections[0] || { name: "Home Essentials", handle: "home-essentials" };
  const n = products.length;
  const validPrices = products.map((p) => p.price).filter((x) => x > 0);
  const minPrice = validPrices.length ? Math.min(...validPrices) : 0;

  // ── Title: catchy DeoDap-style numbered listicle (not the generic "N Best X in India 2026") ──
  const priceHook = minPrice ? ` Under ₹${Math.ceil(minPrice / 10) * 10}` : "";
  const power = ["Must-Have", "Genius", "Clever", "Space-Saving", "Underrated"][n % 5];
  const title =
    a.intent === "transactional"
      ? `Buy ${kw} Online at Wholesale Prices${priceHook} (2026)`
      : n >= 3
      ? `${n} ${power} ${kw}${priceHook} Every Indian Home Needs in 2026`
      : `${power} ${kw} for Every Indian Home in 2026`;

  // ── Intro: problem → solution (~90 words) ──
  const intro =
    `<p>${esc(a.problem_solved)} If that sounds familiar, you're in the right place. From everyday use at home to ` +
    `${esc(a.target_audience.toLowerCase())}, the right ${esc(kw.toLowerCase())} makes daily life easier and tidier. ` +
    `We've rounded up ${n >= 3 ? `${n} practical, budget-friendly picks` : "a few practical, budget-friendly picks"} from DeoDap` +
    `${minPrice ? `, starting as low as ₹${minPrice}` : ""} — each chosen for real, everyday value. Here's the full list, ` +
    `with what each one is best for, so you can pick the one that fits you.</p>`;

  // ── Slim value-prop / category section (1-2 bullets from the real key points) ──
  const catBullets = (a.key_points || [])
    .slice(0, 2)
    .map((pt, i) => `<li><strong>${i === 0 ? "Everyday use" : "Budget-friendly"}:</strong> ${esc(pt)}</li>`)
    .join("");
  const valueProp = catBullets
    ? `<h2>What Makes These ${esc(kw)} Worth It</h2><p>A couple of things matter most when you're choosing:</p><ul>${catBullets}</ul>`
    : "";

  // ── Numbered product sections (DeoDap style: numbered H2 + card + opening line + 5-7 bullets + Shop Now) ──
  const cards = products
    .map((p, i) => {
      const num = i + 1;
      const url = p.url || `https://deodap.in/products/${p.handle}`;
      // Real image on its own line; if none, omit it (no placeholder box).
      const img = p.image_src
        ? `<img class="pimg" src="${esc(p.image_src)}" alt="${esc(p.title)}" loading="lazy">`
        : "";
      const opening = p.utility
        ? `${esc(cap(p.utility))}.`
        : `A dependable ${esc((p.product_type || "everyday home").toLowerCase())} pick from DeoDap's range.`;
      const bullets = [
        `<li><strong>Price:</strong> ₹${p.price}</li>`,
        p.utility
          ? `<li><strong>Best for:</strong> ${esc(p.utility)}.</li>`
          : p.product_type
          ? `<li><strong>Best for:</strong> ${esc(p.product_type.toLowerCase())}.</li>`
          : "",
        p.rating ? `<li><strong>Rating:</strong> ${p.rating}★ (${p.reviewCount || 0} reviews)</li>` : "",
        `<li><strong>Quality build:</strong> a dependable ${esc((p.product_type || "everyday").toLowerCase())} made for Indian homes.</li>`,
        `<li><strong>Wholesale value:</strong> factory-direct pricing that suits households and resellers.</li>`,
      ]
        .filter(Boolean)
        .join("");
      // Plain, un-boxed section: heading, image, opening line, bullets, Shop Now link.
      return `
    <h2>${num}. ${esc(p.title)}</h2>
    ${img}
    <p>${opening}</p>
    <ul class="pmeta">${bullets}</ul>
    <a class="pbtn" href="${url}">Shop Now →</a>`;
    })
    .join("");

  // ── Final Thoughts ──
  const finalThoughts =
    `<h2>Final Thoughts</h2><p>Any of these ${esc(kw.toLowerCase())} will make day-to-day life a little easier — ` +
    `pick the one that matches how you'll use it most. Every option here is built for practical Indian homes` +
    `${minPrice ? ` at wholesale-friendly prices starting at ₹${minPrice}` : ""}, so you get genuine value without overspending.</p>`;

  // ── FAQ: 5-6 practical pairs ──
  const topRated = products.filter((p) => p.rating).sort((x, y) => (y.rating || 0) - (x.rating || 0))[0];
  const cheapest = products.slice().sort((x, y) => x.price - y.price)[0];
  const priceLine = minPrice ? `Prices start at ₹${minPrice} and vary by design and size.` : "Prices vary by design and size.";
  const faqs: [string, string][] = [
    [
      `Which ${kw.toLowerCase()} should I choose?`,
      `It depends on how you'll use it.${cheapest ? ` If budget is the priority, the ${esc(cheapest.title)} starts at ₹${cheapest.price}.` : ""}${topRated ? ` For top-rated quality, buyers like the ${esc(topRated.title)} (${topRated.rating}★).` : ""}`,
    ],
    [`How much do these cost?`, `${priceLine} Live pricing is on each product page on deodap.in.`],
    [`Are they good for everyday use?`, `Yes. ${esc(a.problem_solved)} These picks are built to solve exactly that, holding up well to daily Indian household use.`],
    [`Can I buy these in bulk for reselling?`, `Absolutely. DeoDap is a wholesale platform, so these are priced factory-direct — ideal for retailers and online resellers buying in quantity.`],
    [`Will they work at home and on the go?`, `Most are compact and practical for both home and travel. Check each product's "Best for" line above to match it to your routine.`],
    [`How do I order from DeoDap?`, `Tap "Shop Now" on any pick to open its page on deodap.in, then add to cart and check out — delivery is available across India.`],
  ];
  const faqHtml = `<h2>Frequently Asked Questions</h2><dl>${faqs
    .map(([q, ans]) => `<dt>${esc(q)}</dt><dd>${esc(ans)}</dd>`)
    .join("")}</dl>`;

  const cta = `<div class="cta"><p>Ready to upgrade with quality ${esc(kw.toLowerCase())} at wholesale prices?</p><a class="ctabtn" href="https://deodap.in/collections/${coll.handle}">Shop the ${esc(coll.name)} Collection →</a></div>`;

  const html = `<h1>${esc(title)}</h1>${intro}${valueProp}${cards}${finalThoughts}${faqHtml}${cta}`;

  return { title, html };
}
