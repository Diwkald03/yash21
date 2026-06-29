// Brand/term corrections for YouTube auto-captions, which badly mishear Indian
// brand names (e.g. "DeoDap" -> "Du डब", "Meesho" -> "MSHO"). Deterministic and
// fast, so it runs automatically on every transcript. Extend BRAND_FIXES as needed.
const BRAND_FIXES: Array<[RegExp, string]> = [
  // DeoDap
  [/\bDu\s*ड[बैपप्]+/gi, "DeoDap"],
  [/\bDu\s*Dab\b/gi, "DeoDap"],
  [/(?:दि|डि|दी|डी|द्यो|दियो|डियो|देओ|देव|दे)\s*ड[ैे]प/g, "DeoDap"],
  [/\bdeo\s*dap\b/gi, "DeoDap"],
  [/\bdeodap\b/gi, "DeoDap"],
  // Meesho
  [/\bMS\s*HO\b/gi, "Meesho"],
  [/\bMSHO\b/gi, "Meesho"],
  [/म[ीि]शो/g, "Meesho"],
  [/\bmeesho\b/gi, "Meesho"],
  // Grabnix
  [/\bgrab\s*nix\b/gi, "Grabnix"],
  [/ग्रैब\s*निक्स/g, "Grabnix"],
];

export function fixTerms(text: string): string {
  let t = text || "";
  for (const [re, rep] of BRAND_FIXES) t = t.replace(re, rep);
  return t;
}

// Brand glossary handed to the AI clean-up so it spells these correctly too.
export const BRAND_GLOSSARY = "DeoDap, Meesho, Grabnix, Flipkart, Amazon, Myntra, Shopify";
