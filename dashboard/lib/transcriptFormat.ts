/**
 * Make raw caption text readable: de-stutter rolling auto-captions, then segment
 * into sentences/paragraphs. Works for punctuated (manual) and unpunctuated
 * (auto-generated) captions, including Hindi (danda "।").
 */
export function formatTranscript(raw: string): string {
  let t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "";

  // collapse immediate word stutter: "the the casserole" -> "the casserole"
  t = t.replace(/\b(\w+)(\s+\1\b)+/giu, "$1");

  // collapse short repeated phrases (rolling auto-caption overlap), 2-6 words
  t = t.replace(/\b((?:\w+\s+){1,5}\w+)\s+\1\b/giu, "$1");

  const hasPunct = /[.!?।]/.test(t);

  if (hasPunct) {
    const sentences = t
      .split(/(?<=[.!?।])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return groupIntoParagraphs(sentences, 3);
  }

  // unpunctuated auto-captions: chunk into readable ~26-word lines, then paragraphs
  const words = t.split(" ");
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 26) lines.push(words.slice(i, i + 26).join(" "));
  return groupIntoParagraphs(lines, 3);
}

function groupIntoParagraphs(units: string[], perPara: number): string {
  const paras: string[] = [];
  for (let i = 0; i < units.length; i += perPara) {
    paras.push(units.slice(i, i + perPara).join(" "));
  }
  return paras.join("\n\n");
}
