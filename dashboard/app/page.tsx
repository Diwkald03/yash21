"use client";

import { useEffect, useState } from "react";
import type { Source, Analysis, ChatMessage } from "@/lib/types";
import { extractVideoId, mockShopify, buildSeo, buildSchema, extractFaqPairs } from "@/lib/localAnalyze";
import { Icon } from "@/components/Icon";
import { AuthScreen } from "@/components/AuthScreen";

interface SafeUser { id: string; name: string; email: string }
type Result = { sourceId: string } & Source["outputs"];
type Tab = "products" | "blog" | "analysis" | "seo" | "schema";

// Parse a fetch response into JSON, but turn empty/HTML/500 bodies into a clear,
// actionable error instead of the cryptic "Unexpected end of JSON input".
async function jsonOrThrow(res: Response, label: string) {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`${label} failed — the server returned nothing (HTTP ${res.status}). If this keeps happening, the database may be down: run "npm run db".`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} failed (HTTP ${res.status}): ${text.replace(/<[^>]+>/g, " ").slice(0, 140)}`);
  }
}

const STEPS = ["Transcript", "Products", "Blog", "Draft"] as const;

export default function Home() {
  // auth + status
  const [user, setUser] = useState<SafeUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [claudeOn, setClaudeOn] = useState(false);
  const [aiLabel, setAiLabel] = useState("AI");
  const [shopifyOn, setShopifyOn] = useState(false);
  const [db, setDb] = useState("file");

  // inputs
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [chatReady, setChatReady] = useState(false); // chat available as soon as a transcript exists (no full pipeline needed)
  const [title, setTitle] = useState("");
  const [showTranscript, setShowTranscript] = useState(true);
  const [fetchingT, setFetchingT] = useState(false);
  const [tLang, setTLang] = useState("");
  const [langs, setLangs] = useState<{ code: string; name: string; auto?: boolean }[]>([]);
  const [tStatus, setTStatus] = useState<{ type: "good" | "warn"; msg: string } | null>(null);
  const [segments, setSegments] = useState<{ t: number; text: string }[]>([]);
  const [tView, setTView] = useState<"stamps" | "text">("text");
  const [seekT, setSeekT] = useState<number | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [prodSource, setProdSource] = useState<string>("");

  // pipeline + results
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0); // 0 none, 1..4
  const [stageErr, setStageErr] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<Tab>("blog");

  // history + chat
  const [recent, setRecent] = useState<Source[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [toast, setToast] = useState("");

  const videoId = extractVideoId(url);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((d) => {
      setClaudeOn(Boolean(d.claude)); setShopifyOn(Boolean(d.shopify)); setDb(d.db || "file");
      setAiLabel(d.engine === "claude" ? "Claude" : d.engine === "openai" ? (d.provider || "Free LLM") : "Local AI");
    }).catch(() => {});
    fetch("/api/auth/me").then((r) => r.json()).then(async (d) => {
      if (d.user) { setUser(d.user); await loadRecent(); }
    }).catch(() => {}).finally(() => setAuthLoading(false));
  }, []);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2800); }

  async function loadRecent() {
    try {
      const d = await (await fetch("/api/sources")).json();
      if (Array.isArray(d.sources)) {
        setRecent(d.sources.map((s: Record<string, unknown>) => ({
          id: s.id as string, url: s.url as string, videoId: (s.videoId as string) ?? null,
          title: s.title as string, transcript: s.transcript as string,
          createdAt: String(s.createdAt || "").slice(0, 10), outputs: (s.outputs as Source["outputs"]) || {},
        })));
      }
    } catch { /* ignore */ }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null); setRecent([]); setResult(null); resetInputs();
  }
  function resetInputs() { setUrl(""); setTranscript(""); setChatReady(false); setTitle(""); setTLang(""); setLangs([]); setTStatus(null); setStage(0); setChat([]); setSegments([]); setSeekT(null); setTView("text"); }

  function fmtTime(s: number) { const m = Math.floor(s / 60); const ss = Math.floor(s % 60); return `${m}:${String(ss).padStart(2, "0")}`; }

  async function copyTranscript() {
    try { await navigator.clipboard.writeText(transcript); flash("Transcript copied"); }
    catch { flash("Copy failed — select and copy manually"); }
  }

  async function cleanTranscript() {
    if (!transcript.trim() || cleaning) return;
    setCleaning(true);
    try {
      const d = await (await fetch("/api/transcript/clean", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      })).json();
      if (d.cleaned) {
        setTranscript(d.cleaned); setTView("text");
        flash(d.engine === "local" ? "Add a model key to clean with AI" : "Transcript cleaned — spelling & punctuation fixed");
      } else { flash(d.error ? `Clean-up failed: ${d.error}` : "Clean-up failed"); }
    } catch { flash("Clean-up failed — network error"); }
    finally { setCleaning(false); }
  }

  async function getTranscript() {
    if (!url.trim()) { flash("Paste a YouTube URL first"); return; }
    setFetchingT(true); setTStatus(null);
    try {
      const d = await (await fetch("/api/transcript", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })).json();
      if (d.title && !title) setTitle(d.title);
      if (d.available?.length) setLangs(d.available);
      if (d.ok) {
        setTranscript(d.transcript); setChatReady(true); setTLang(d.language); setShowTranscript(true);
        const segs = Array.isArray(d.segments) ? d.segments : [];
        setSegments(segs); setSeekT(null);
        setTView(segs.length ? "stamps" : "text");
        setTStatus({ type: "good", msg: `Transcript loaded — ${d.languageName} · ${d.transcript.split(/\s+/).length} words${d.cached ? " · cached (instant)" : ""}` });
      } else {
        setTStatus({ type: "warn", msg: d.error || "Could not fetch transcript." });
      }
    } catch {
      setTStatus({ type: "warn", msg: "Network error fetching transcript." });
    } finally { setFetchingT(false); }
  }

  async function changeLang(code: string) {
    setTLang(code); setFetchingT(true);
    try {
      const d = await (await fetch("/api/transcript", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), lang: code }),
      })).json();
      if (d.ok) {
        setTranscript(d.transcript); setChatReady(true);
        const segs = Array.isArray(d.segments) ? d.segments : [];
        setSegments(segs); setSeekT(null);
        setTView(segs.length ? "stamps" : "text");
        setTStatus({ type: "good", msg: `Switched to ${d.languageName}` });
      }
    } catch { /* ignore */ } finally { setFetchingT(false); }
  }

  // The one action: transcript → products → blog → Shopify draft
  async function draft() {
    if (!videoId) { flash("Enter a valid YouTube URL"); return; }
    if (!transcript.trim()) { flash("Add the transcript (click Get transcript)"); return; }
    setRunning(true); setStageErr(false); setResult(null); setChat([]); setChatReady(true);
    try {
      // create the source row
      const srcRes = await jsonOrThrow(await fetch("/api/sources", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), videoId, title: title || "Draft from YouTube", transcript: transcript.trim() }),
      }), "Save source");
      if (srcRes.error) throw new Error(srcRes.error);
      const sourceId: string = srcRes.source.id;

      setStage(1); await sleep(250);

      // Stage 2 — analyze + Shopify products
      setStage(2);
      const analysis: Analysis = await jsonOrThrow(await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcript.trim() }),
      }), "Analyze");
      if ((analysis as unknown as { error?: string }).error) throw new Error(String((analysis as unknown as { error: string }).error));
      let shopify;
      try {
        const sf = await (await fetch("/api/shopify/products", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis }),
        })).json();
        shopify = sf.products?.length ? sf.products : mockShopify(analysis);
        if (sf.collections?.length) analysis.collections = sf.collections;
        setProdSource(sf.products?.length ? (sf.source || "demo") : "demo");
      } catch { shopify = mockShopify(analysis); setProdSource("demo"); }

      // Stage 3 — blog + SEO/schema
      setStage(3);
      const blog = await jsonOrThrow(await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // PRD: feature EVERY product (cap 24 to stay within token limits); Products tab shows all too
        body: JSON.stringify({ analysis, products: shopify.slice(0, 24) }),
      }), "Write blog");
      if (blog.error || !blog.html) throw new Error(blog.error || "Blog generation returned no content.");
      const seo = buildSeo(analysis, shopify, blog.html);
      const faqs = extractFaqPairs(blog.html);
      const schema = buildSchema(analysis, seo, faqs.length ? faqs : defaultFaqs(analysis), { videoId, videoTitle: title });

      // persist before publish
      await fetch(`/api/sources/${sourceId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputs: { analysis, shopify, blogTitle: blog.title, blogHtml: blog.html, seo, schema } }),
      }).catch(() => {});

      // Stage 4 — Shopify draft
      setStage(4);
      const pub = await jsonOrThrow(await fetch("/api/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      }), "Shopify draft");
      if (pub.error) throw new Error(pub.error);

      setResult({
        sourceId, analysis, shopify, blogTitle: blog.title, blogHtml: blog.html, seo, schema,
        published: pub.draftUrl, publishSimulated: pub.simulated,
      });
      setTab("products");
      flash(pub.simulated ? "Demo draft created — add Shopify token to go live" : "Draft created in Shopify");
      await loadRecent();
    } catch (e) {
      setStageErr(true);
      flash("Pipeline error: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setRunning(false); }
  }

  function openRecent(s: Source) {
    setUrl(s.url); setTranscript(s.transcript); setChatReady(true); setTitle(s.title); setStage(0); setChat([]);
    setResult({ sourceId: s.id, ...s.outputs });
    setTab("blog");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function deleteRecent(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/sources/${id}`, { method: "DELETE" }).catch(() => {});
    if (result?.sourceId === id) setResult(null);
    loadRecent();
  }

  async function sendChat() {
    if (!chatReady || !chatInput.trim() || chatBusy) return;
    const q = chatInput.trim(); setChatInput("");
    const history = chat;
    setChat([...history, { role: "user", text: q }]);
    setChatBusy(true);
    try {
      const d = await (await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, question: q, history }),
      })).json();
      setChat((c) => [...c, { role: "assistant", text: d.answer }]);
    } catch {
      setChat((c) => [...c, { role: "assistant", text: "Network error." }]);
    } finally { setChatBusy(false); }
  }

  if (authLoading) return <div className="auth-loading"><span className="spin dark" /> Loading…</div>;
  if (!user) return <AuthScreen onAuthed={(u) => { setUser(u); loadRecent(); }} />;

  return (
    <div className="app-shell">
      <header className="app-hdr">
        <div className="app-hdr-in">
          <span className="dd-badge">DeoDap</span>
          <div className="hbrand">
            <div className="htitle">Blog Drafter</div>
            <div className="hsub">YouTube → SEO Shopify drafts</div>
          </div>
          <div className="hdr-right">
            <span className="chip-status" title={claudeOn ? `${aiLabel} model connected` : "Local AI fallback"}>
              <span className={`dot ${claudeOn ? "on" : "off"}`} /><span className="lbl">{aiLabel}</span>
            </span>
            <span className="chip-status" title={shopifyOn ? "Shopify connected" : "Shopify demo mode"}>
              <span className={`dot ${shopifyOn ? "on" : "off"}`} /><span className="lbl">{shopifyOn ? "Shopify" : "Shopify demo"}</span>
            </span>
            <span className="chip-status" title={`Database: ${db}`}>
              <Icon name="layers" size={13} /><span className="lbl">{db === "postgres" ? "Postgres" : "File DB"}</span>
            </span>
            <span className="hsep" />
            <button className="link-btn" onClick={logout}>Sign out</button>
            <div className="avatar2" title={user.name}>{(user.name || "U").charAt(0).toUpperCase()}</div>
          </div>
        </div>
      </header>

      <main className="drafter">
        <p className="intro">
          Paste a YouTube URL and transcript, then click draft. The system searches your Shopify
          products, writes the blog, and creates the <b>draft article</b> for you.
        </p>

        {/* steps */}
        <div className="steps">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const done = stage > n || (!!result && stage === 0);
            const active = running && stage === n;
            return (
              <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className={`step ${active ? "active" : done ? "done" : ""}`}>
                  <Icon name={["file", "search", "blog", "send"][i]} size={14} />{s}
                </span>
                {i < STEPS.length - 1 && <span className="step-arrow"><Icon name="chevronDown" size={14} strokeWidth={2} /></span>}
              </span>
            );
          })}
        </div>

        {/* URL */}
        <div className="blk">
          <div className="blk-head">
            <label>YouTube video URL</label>
            {videoId && <span className="detected"><Icon name="check" size={14} /> Detected</span>}
          </div>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/..." />
          {videoId && (
            <div className="video-frame">
              <iframe key={seekT ?? -1}
                src={`https://www.youtube.com/embed/${videoId}?rel=0${seekT != null ? `&start=${seekT}&autoplay=1` : ""}`}
                title="preview" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen loading="lazy" />
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="blk">
          <div className="blk-head">
            <label>Transcript</label>
            <div className="actions">
              {langs.length > 1 && (
                <select className="btn sm" value={tLang} onChange={(e) => changeLang(e.target.value)}>
                  {langs.map((l) => <option key={l.code} value={l.code}>{l.name}{l.auto ? " (auto)" : ""}</option>)}
                </select>
              )}
              <button className="btn sm" onClick={getTranscript} disabled={fetchingT || !url.trim()}>
                {fetchingT ? <span className="spin dark" /> : <Icon name="download" size={14} />}
                {fetchingT ? "Reading…" : "Get transcript"}
              </button>
              {transcript && (
                <>
                  <button className="btn sm" onClick={copyTranscript}><Icon name="copy" size={14} /> Copy</button>
                  <button className="btn sm" onClick={cleanTranscript} disabled={cleaning} title="Fix spelling & punctuation with AI (keeps the language)">
                    {cleaning ? <span className="spin dark" /> : <Icon name="spark" size={14} />} {cleaning ? "Cleaning…" : "Clean up"}
                  </button>
                </>
              )}
              <button className="btn sm" onClick={() => setShowTranscript((v) => !v)}>
                <Icon name={showTranscript ? "chevronUp" : "chevronDown"} size={14} /> {showTranscript ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {showTranscript && segments.length > 0 && (
            <div className="tview-toggle">
              <button className={tView === "stamps" ? "on" : ""} onClick={() => setTView("stamps")}><Icon name="clock" size={13} /> Timestamps</button>
              <button className={tView === "text" ? "on" : ""} onClick={() => setTView("text")}><Icon name="file" size={13} /> Reader</button>
            </div>
          )}

          {showTranscript && (
            (segments.length > 0 && tView === "stamps") ? (
              <div className="tscript">
                {segments.map((s, i) => (
                  <button key={i} className="tseg" onClick={() => setSeekT(s.t)} title="Jump to this moment in the video above">
                    <span className="tstamp">{fmtTime(s.t)}</span>
                    <span className="ttext">{s.text}</span>
                  </button>
                ))}
              </div>
            ) : (
              <textarea className="ta" value={transcript} onChange={(e) => setTranscript(e.target.value)}
                placeholder="Click Get transcript to read it from the video automatically (Hindi/Hinglish & Indian languages), or paste it here." />
            )
          )}

          <div className="ta-foot">
            <Icon name="file" size={13} /> {transcript.length.toLocaleString()} characters
            {segments.length > 0 && <span> · {segments.length} timestamped lines</span>}
            {tStatus && <span style={{ color: tStatus.type === "good" ? "var(--green)" : "var(--amber)" }}>· {tStatus.msg}</span>}
          </div>
        </div>

        {/* Draft button */}
        <button className="draft-cta" onClick={draft} disabled={running}>
          {running ? <span className="spin" /> : <Icon name="send" size={18} />}
          {running ? "Drafting…" : "Draft Blog to Shopify"}
        </button>
        <div className="helper">Runs the product search, blog writing and Shopify drafting, then shows the result below.</div>
        <div className="infobanner">
          <Icon name="spark" size={16} />
          <span>The product search, blog writing and Shopify drafting run on the server — you don&apos;t paste any API keys in the browser.{!shopifyOn && " Add a Shopify token to wire real drafts (currently demo mode)."}</span>
        </div>

        {/* pipeline progress */}
        {(running || stageErr) && (
          <div className="pipe">
            {STEPS.map((s, i) => {
              const n = i + 1;
              const done = stage > n;
              const active = running && stage === n;
              const er = stageErr && stage === n;
              return (
                <div key={s} className={`pstep ${er ? "err" : done ? "done" : active ? "active" : ""}`}>
                  <div className="n">{done ? <Icon name="check" size={13} /> : n}</div>
                  <div className="l">{["Read transcript", "Analyze + fetch Shopify products", "Write SEO blog", "Create Shopify draft"][i]}</div>
                  <div className="st">{er ? "failed" : active ? "running…" : done ? "done" : "waiting"}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* results — shown once the pipeline has produced output (products, blog, SEO, schema) */}
        {result && <Results result={result} tab={tab} setTab={setTab} shopifyOn={shopifyOn} prodSource={prodSource}
          chat={chat} chatInput={chatInput} setChatInput={setChatInput} chatBusy={chatBusy} sendChat={sendChat} flash={flash} />}

        {/* recent drafts */}
        {recent.length > 0 && (
          <div className="recent">
            <h3>Recent drafts</h3>
            {recent.map((s) => (
              <div key={s.id} className="recent-item" onClick={() => openRecent(s)}>
                {s.videoId
                  ? <img className="recent-thumb" alt="" width={64} height={42} loading="lazy" src={`https://img.youtube.com/vi/${s.videoId}/default.jpg`} />
                  : <div className="recent-thumb ph"><Icon name="video" size={16} /></div>}
                <div className="recent-meta">
                  <div className="t">{s.title}</div>
                  <div className="s">
                    <Icon name="clock" size={12} /> {s.createdAt}
                    {s.outputs?.published && <span style={{ color: "var(--green)" }}>· {s.outputs.publishSimulated ? "demo draft" : "drafted"}</span>}
                  </div>
                </div>
                <button className="recent-del" title="Delete" aria-label="Delete draft" onClick={(e) => deleteRecent(s.id, e)}><Icon name="trash" size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="app-ftr">
        <div className="app-ftr-in">
          <div className="ftr-brand">
            <span className="dd-badge">DeoDap</span>
            <span className="ftr-tag">Turn YouTube videos into SEO-ready Shopify blog drafts, automatically.</span>
          </div>
          <div className="ftr-meta">
            <span className="ftr-stat"><span className={`dot ${claudeOn ? "on" : "off"}`} /> {aiLabel} · {db === "postgres" ? "Postgres" : "File DB"} · {shopifyOn ? "Shopify" : "Demo"}</span>
            <span className="ftr-copy">© 2026 DeoDap · Blog Drafter</span>
          </div>
        </div>
      </footer>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────
function Results({
  result, tab, setTab, shopifyOn, prodSource, chat, chatInput, setChatInput, chatBusy, sendChat, flash,
}: {
  result?: Result; tab: Tab; setTab: (t: Tab) => void; shopifyOn: boolean; prodSource: string;
  chat: ChatMessage[]; chatInput: string; setChatInput: (s: string) => void;
  chatBusy: boolean; sendChat: () => void; flash: (m: string) => void;
}) {
  const a = result?.analysis; const seo = result?.seo; const schema = result?.schema;
  function copy(t: string, m: string) { navigator.clipboard.writeText(t).then(() => flash(m)).catch(() => flash("Copy failed")); }
  function badge(v: string) {
    const c = v === "high" ? "b-high" : v === "medium" ? "b-medium" : v === "low" ? "b-low" : "b-info";
    return <span className={`badge ${c}`}>{v.toUpperCase()}</span>;
  }
  function meter(label: string, len: number, max: number, value: string, good: boolean) {
    const pct = Math.min(100, (len / max) * 100);
    const color = good ? "var(--green)" : len > max ? "var(--red)" : "var(--amber)";
    return (
      <div className="acard">
        <div className="k">{label}</div><div className="v">{value}</div>
        <div className="meter"><i style={{ width: `${pct}%`, background: color }} /></div>
        <div className="meta-row"><span style={{ color }}>{len}{label.includes("Title") ? " / 60" : ""} chars</span>
          <span style={{ color }}>{good ? "Good" : len > max ? "Too long" : "Adjust"}</span></div>
      </div>
    );
  }

  return (
    <div className="results">
      {result && (<>
      {result.published && (
        <div className="draft-banner">
          <div className="gico"><Icon name="check" size={18} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="t">{result.publishSimulated ? "Demo draft created" : "Draft created in Shopify"}</div>
            <a href={result.published} target="_blank" rel="noreferrer">{result.published}</a>
          </div>
          <a className="btn sm" style={{ marginLeft: "auto" }} href={result.published} target="_blank" rel="noreferrer">
            <Icon name="external" size={14} /> Open
          </a>
        </div>
      )}

      <div className="rtabs">
        {(["products", "blog", "analysis", "seo", "schema"] as Tab[]).map((t) => (
          <button key={t} className={`rtab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "products" ? `Products${result.shopify ? ` (${result.shopify.length})` : ""}` : t === "blog" ? "Blog" : t === "analysis" ? "Analysis" : t === "seo" ? "SEO" : "Schema"}
          </button>
        ))}
      </div>

      <div className="rpane">
        {tab === "products" && (
          (result.shopify && result.shopify.length) ? (
            <>
              <div className="acard" style={{ marginBottom: 12 }}>
                <div className="k">All {result.shopify.length} products shown in this video</div>
                <div className="v">Every product from the video{
                  shopifyOn ? ", matched to your live Shopify catalog"
                    : prodSource === "storefront" ? " — enriched with live deodap.in images, prices & customer ratings"
                    : " (demo catalog — connect Shopify or check the URL)"
                }. Items not found on the store still appear, using the details from the video.</div>
              </div>
              <div className="blog" style={{ background: "transparent", padding: 0, border: 0 }}>
                <div className="pgrid">
                  {result.shopify.map((p, i) => {
                    const pr = p as unknown as { title: string; handle: string; price: number; image_src?: string; image_color?: string; product_type?: string; url?: string; utility?: string; description?: string; rating?: number; reviewCount?: number; storePrice?: number; matched?: boolean };
                    const img = pr.image_src;
                    const color = pr.image_color || "#0d9488";
                    const link = pr.url || (pr.handle ? `https://deodap.in/products/${pr.handle}` : `https://deodap.in/search?q=${encodeURIComponent(pr.title)}`);
                    const stars = pr.rating ? Math.round(pr.rating) : 0;
                    const desc = pr.utility || pr.description || pr.product_type || "";
                    return (
                      <div key={pr.handle || i} className="pcard">
                        <div className="pimg" style={img ? { background: `#000 url(${img}) center/cover no-repeat` } : { background: `linear-gradient(135deg, ${color}, #0f172a)` }}>
                          {img ? "" : pr.title}
                        </div>
                        <div className="pbody">
                          <h3><a href={link} target="_blank" rel="noreferrer">{pr.title}</a></h3>
                          <div className="pprice">{pr.price ? `₹${pr.price}` : "Price on site"}{pr.storePrice && pr.storePrice !== pr.price ? <span style={{ fontSize: 11, fontWeight: 500, color: "#94a3b8", marginLeft: 6 }}>deodap.in ₹{pr.storePrice}</span> : null}</div>
                          {pr.rating ? (
                            <div style={{ fontSize: 12.5, color: "#b45309", fontWeight: 600, margin: "2px 0" }}>
                              <span style={{ letterSpacing: 1 }}>{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span> {pr.rating.toFixed(1)}{pr.reviewCount ? ` · ${pr.reviewCount} reviews` : ""}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12.5, color: "#94a3b8", fontWeight: 500, margin: "2px 0" }}>No ratings yet</div>
                          )}
                          <p style={{ color: "#475569", fontSize: 12.5, margin: "4px 0 8px", lineHeight: 1.5, minHeight: 36 }}>{desc}</p>
                          {pr.matched === false && <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>From the video — not matched on store</div>}
                          <a className="pbtn" href={link} target="_blank" rel="noreferrer">View product</a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="acard">No products detected for this video.</div>
          )
        )}

        {tab === "blog" && result.blogHtml && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button className="btn sm" onClick={() => copy(result.blogHtml!, "Blog HTML copied")}><Icon name="copy" size={14} /> Copy HTML</button>
            </div>
            <div className="blog" dangerouslySetInnerHTML={{ __html: result.blogHtml }} />
            <div className="hint" style={{ textAlign: "right" }}>~{result.blogHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length} words</div>
          </>
        )}

        {tab === "analysis" && a && (
          <>
            <div className="grid2">
              <div className="acard"><div className="k">Main Topic</div><div className="v">{a.topic}</div></div>
              <div className="acard"><div className="k">Problem Solved</div><div className="v">{a.problem_solved}</div></div>
            </div>
            <div className="grid2">
              <div className="acard"><div className="k">Search Intent</div><div className="v">{badge(a.intent)}</div></div>
              <div className="acard"><div className="k">Buying Intent</div><div className="v">{badge(a.buying_intent)}</div></div>
            </div>
            <div className="acard"><div className="k">Target Audience</div><div className="v">{a.target_audience}</div></div>
            <div className="acard"><div className="k">Products Shown</div><div className="v">{a.products.map((p) => <span key={p} className="chip">{p}</span>)}</div></div>
            <div className="acard"><div className="k">Collections Discussed</div><div className="v">{a.collections.map((c) => <span key={c.handle} className="chip">{c.name}</span>)}</div></div>
            <div className="grid2">
              <div className="acard"><div className="k">Primary Keyword</div><div className="v"><b>{a.primary_keyword}</b></div></div>
              <div className="acard"><div className="k">Secondary Keywords</div><div className="v">{a.secondary_keywords.map((k) => <span key={k} className="chip alt">{k}</span>)}</div></div>
            </div>
            <div className="hint">Engine: <b>{a.engine === "claude" ? "Claude Sonnet 4.6 (live)" : "Local heuristic AI"}</b></div>
          </>
        )}

        {tab === "seo" && seo && (
          <>
            <div className="serp">
              <div className="u">deodap.in › blogs › all › {seo.slug}</div>
              <div className="t">{seo.seoTitle}</div><div className="d">{seo.metaDesc}</div>
            </div>
            {meter("SEO Title", seo.seoTitle.length, 60, seo.seoTitle, seo.seoTitle.length <= 60)}
            {meter("Meta Description", seo.metaDesc.length, 160, seo.metaDesc, seo.metaDesc.length >= 120 && seo.metaDesc.length <= 160)}
            <div className="grid2">
              <div className="acard"><div className="k">Focus keyword</div><div className="v">{seo.focusKeyword}</div></div>
              <div className="acard"><div className="k">URL slug</div><div className="v"><code>/{seo.slug}</code></div></div>
              <div className="acard"><div className="k">Reading time</div><div className="v">{seo.readingTime} min read · {seo.wordCount.toLocaleString()} words</div></div>
              <div className="acard"><div className="k">Robots</div><div className="v" style={{ fontSize: 12 }}>{seo.robots}</div></div>
            </div>
            <div className="acard"><div className="k">Canonical URL</div><div className="v" style={{ fontSize: 12, wordBreak: "break-all" }}>{seo.canonical}</div></div>
            {seo.keywords?.length > 0 && (
              <div className="acard"><div className="k">Keywords ({seo.keywords.length})</div>
                <div className="chips">{seo.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</div>
              </div>
            )}
            {seo.imageUrl && (
              <div className="acard"><div className="k">Social share image (og:image)</div>
                <img src={seo.imageUrl} alt={seo.imageAlt} className="og-img" loading="lazy" />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn sm" onClick={() => copy(seo.metaTags, "Meta tags copied")}><Icon name="copy" size={14} /> Copy all meta tags</button>
              <button className="btn sm" onClick={() => copy(JSON.stringify(seo.ogTags, null, 2), "Open Graph tags copied")}><Icon name="copy" size={14} /> OG</button>
              <button className="btn sm" onClick={() => copy(JSON.stringify(seo.twitterTags, null, 2), "Twitter tags copied")}><Icon name="copy" size={14} /> Twitter</button>
            </div>
            <details className="acard" style={{ marginTop: 8 }}>
              <summary className="k" style={{ cursor: "pointer" }}>Ready-to-paste &lt;head&gt; meta tags</summary>
              <pre className="code" style={{ marginTop: 8 }}>{seo.metaTags}</pre>
            </details>
          </>
        )}

        {tab === "schema" && schema && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <button className="btn sm" onClick={() => copy(schema.combined, "All schema (combined) copied")}><Icon name="copy" size={14} /> Copy all (combined)</button>
              <button className="btn sm" onClick={() => copy(JSON.stringify(schema.articleSchema, null, 2), "Article schema copied")}><Icon name="copy" size={14} /> Article</button>
              <button className="btn sm" onClick={() => copy(JSON.stringify(schema.faqSchema, null, 2), "FAQ schema copied")}><Icon name="copy" size={14} /> FAQ</button>
              {schema.breadcrumbSchema && <button className="btn sm" onClick={() => copy(JSON.stringify(schema.breadcrumbSchema, null, 2), "Breadcrumb schema copied")}><Icon name="copy" size={14} /> Breadcrumb</button>}
              {schema.videoSchema && <button className="btn sm" onClick={() => copy(JSON.stringify(schema.videoSchema, null, 2), "VideoObject schema copied")}><Icon name="copy" size={14} /> Video</button>}
              {schema.softwareSchema && <button className="btn sm" onClick={() => copy(JSON.stringify(schema.softwareSchema, null, 2), "SoftwareApplication schema copied")}><Icon name="copy" size={14} /> Software</button>}
            </div>
            <div className="acard" style={{ background: "transparent", border: 0, padding: 0 }}>
              <div className="k">BlogPosting (Article) JSON-LD</div>
              <pre className="code" style={{ marginTop: 6, marginBottom: 12 }}>{JSON.stringify(schema.articleSchema, null, 2)}</pre>
              <div className="k">FAQPage JSON-LD{Array.isArray((schema.faqSchema as { mainEntity?: unknown[] }).mainEntity) ? ` · ${(schema.faqSchema as { mainEntity: unknown[] }).mainEntity.length} Q&A` : ""}</div>
              <pre className="code" style={{ marginTop: 6, marginBottom: 12 }}>{JSON.stringify(schema.faqSchema, null, 2)}</pre>
              {schema.breadcrumbSchema && <>
                <div className="k">BreadcrumbList JSON-LD</div>
                <pre className="code" style={{ marginTop: 6, marginBottom: 12 }}>{JSON.stringify(schema.breadcrumbSchema, null, 2)}</pre>
              </>}
              {schema.videoSchema && <>
                <div className="k">VideoObject JSON-LD <span style={{ color: "var(--green)", fontWeight: 600 }}>· active rich result</span></div>
                <pre className="code" style={{ marginTop: 6, marginBottom: 12 }}>{JSON.stringify(schema.videoSchema, null, 2)}</pre>
              </>}
              {schema.softwareSchema && <>
                <div className="k">SoftwareApplication JSON-LD <span style={{ color: "var(--muted)" }}>· for the tool&apos;s own landing page</span></div>
                <pre className="code" style={{ marginTop: 6 }}>{JSON.stringify(schema.softwareSchema, null, 2)}</pre>
              </>}
            </div>
          </>
        )}
      </div>
      </>)}

      {/* Inline chat removed — the products view stays separate; the AI assistant returns later as its own widget. */}
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function defaultFaqs(a: Analysis): [string, string][] {
  return [
    [`What is the best ${a.primary_keyword.toLowerCase()}?`, `DeoDap offers quality ${a.primary_keyword.toLowerCase()} at wholesale prices for Indian homes.`],
    ["How much does it cost?", "Prices are wholesale-friendly; check the live collection on deodap.in."],
    ["Is it good for everyday use?", a.problem_solved],
  ];
}
