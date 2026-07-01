import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readdir, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { extractVideoId } from "@/lib/localAnalyze";
import { formatTranscript } from "@/lib/transcriptFormat";
import { fixTerms } from "@/lib/terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileP = promisify(execFile);

// Indian core languages (for the UI language picker / preference order).
const INDIAN: Record<string, string> = {
  hi: "Hindi", en: "English", bn: "Bengali", ta: "Tamil", te: "Telugu", mr: "Marathi",
  gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi", or: "Odia",
  as: "Assamese", ur: "Urdu", sa: "Sanskrit", ne: "Nepali",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": WEB_UA, "Accept-Language": "en-US,en;q=0.9", ...headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

interface Track {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string; runs?: { text: string }[] };
}
interface PlayerData {
  title: string;
  tracks: Track[];
}

// ── 1) Primary: InnerTube ANDROID player API (caption URLs return text server-side) ──
async function fromInnerTube(videoId: string): Promise<PlayerData> {
  const KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w"; // public ANDROID InnerTube key
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
    },
    cache: "no-store",
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "19.09.37",
          androidSdkVersion: 30,
          hl: "en",
          gl: "IN",
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`innertube HTTP ${res.status}`);
  const data = await res.json();
  const tracks: Track[] =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const title: string = data?.videoDetails?.title || "";
  return { title, tracks };
}

// ── 2) Fallback: scrape the watch page HTML ───────────────────────────────────
async function fromWatchHtml(videoId: string): Promise<PlayerData> {
  const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999`);
  let title = "";
  const td = html.match(/"videoDetails":\{.*?"title":"((?:\\.|[^"\\])*)"/);
  if (td) { try { title = JSON.parse(`"${td[1]}"`); } catch { title = td[1]; } }
  if (!title) {
    const tm = html.match(/<title>([\s\S]*?)<\/title>/);
    if (tm) title = decodeEntities(tm[1]).replace(/\s*-\s*YouTube\s*$/, "").trim();
  }
  let tracks: Track[] = [];
  const ct = html.match(/"captionTracks":(\[.*?\])/);
  if (ct) { try { tracks = JSON.parse(ct[1]); } catch { tracks = []; } }
  return { title, tracks };
}

interface Json3Seg { utf8?: string }
interface Json3Event { segs?: Json3Seg[] }

// Request JSON3 first (reliable), fall back to legacy XML.
async function fetchTranscriptText(baseUrl: string): Promise<string> {
  try {
    const jsonUrl = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
    const raw = await fetchText(jsonUrl);
    if (raw.trim().startsWith("{")) {
      const data = JSON.parse(raw) as { events?: Json3Event[] };
      const text = (data.events || [])
        .map((e) => (e.segs || []).map((s) => s.utf8 || "").join(""))
        .join(" ").replace(/\s+/g, " ").trim();
      if (text) return text;
    }
  } catch {
    /* fall through */
  }
  try {
    const xml = await fetchText(baseUrl);
    const parts = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
      decodeEntities(m[1].replace(/<[^>]+>/g, "")),
    );
    return parts.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

// ── 0) Primary (most reliable): yt-dlp — bypasses caption-URL gating ──────────
function parseVtt(vtt: string): string {
  const out: string[] = [];
  for (let line of vtt.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^WEBVTT/.test(line) || /^NOTE/.test(line) || /^(Kind|Language):/i.test(line)) continue;
    if (line.includes("-->")) continue;
    if (/^\d+$/.test(line.trim())) continue;
    line = decodeEntities(line.replace(/<[^>]+>/g, "")).replace(/&nbsp;/g, " ").trim();
    if (!line) continue;
    if (out.length && out[out.length - 1] === line) continue; // dedupe rolling auto-caption lines
    out.push(line);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

export interface TSegment { t: number; text: string }

// Parse VTT into clean, timestamped segments (mm:ss jump points like youtubetotranscript.com).
// De-stutters rolling auto-captions and merges cues into ~14-word readable lines.
function vttSegments(vtt: string): TSegment[] {
  const raw: TSegment[] = [];
  let start = -1;
  let buf: string[] = [];
  const push = () => {
    if (start >= 0 && buf.length) {
      const text = decodeEntities(buf.join(" ").replace(/<[^>]+>/g, ""))
        .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      if (text) raw.push({ t: start, text });
    }
    start = -1; buf = [];
  };
  for (const line of vtt.split(/\r?\n/)) {
    const m = line.match(/(\d{2}):(\d{2}):(\d{2})[.,]\d{3}\s*-->/);
    if (m) { push(); start = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); continue; }
    const tr = line.trim();
    if (!tr || /^WEBVTT/.test(tr) || /^NOTE/.test(tr) || /^(Kind|Language):/i.test(tr) || /^\d+$/.test(tr)) continue;
    buf.push(tr);
  }
  push();

  // remove rolling-overlap duplication between consecutive cues
  const dedup: TSegment[] = [];
  for (const c of raw) {
    const prev = dedup[dedup.length - 1];
    if (!prev) { dedup.push({ ...c }); continue; }
    if (c.text === prev.text) continue;
    if (c.text.startsWith(prev.text)) { prev.text = c.text; continue; } // rolling caption grew
    dedup.push({ ...c });
  }

  // merge into ~14-word readable, timestamped segments
  const out: TSegment[] = [];
  let curT = -1;
  let words: string[] = [];
  const flush = () => { if (curT >= 0 && words.length) out.push({ t: curT, text: words.join(" ").replace(/\s+/g, " ").trim() }); curT = -1; words = []; };
  for (const c of dedup) {
    if (curT < 0) curT = c.t;
    words.push(...c.text.split(/\s+/));
    if (words.length >= 14) flush();
  }
  flush();
  return out;
}

interface YtDlpResult {
  title: string;
  available: { code: string; name: string; auto: boolean }[];
  chosen: { code: string; text: string; segments: TSegment[] } | null;
}

// Resolve a working yt-dlp invocation. Node can't launch the WindowsApps `python`
// App Execution Alias, so we probe real executables in order and cache the winner.
let RESOLVED: { cmd: string; pre: string[] } | null = null;
async function resolveYtDlp(): Promise<{ cmd: string; pre: string[] } | null> {
  if (RESOLVED) return RESOLVED;
  const candidates: { cmd: string; pre: string[] }[] = [];
  if (process.env.YTDLP_BIN) candidates.push({ cmd: process.env.YTDLP_BIN, pre: [] });
  for (const env of ["LOCALAPPDATA", "APPDATA"]) {
    const base = process.env[env];
    if (!base) continue;
    for (const sub of ["Python", "Programs\\Python"]) {
      const root = join(base, sub);
      try {
        for (const d of await readdir(root)) {
          const p = join(root, d, "Scripts", "yt-dlp.exe");
          try { await stat(p); candidates.push({ cmd: p, pre: [] }); } catch {}
        }
      } catch {}
    }
  }
  candidates.push({ cmd: "yt-dlp", pre: [] });
  if (process.env.PYTHON_BIN) candidates.push({ cmd: process.env.PYTHON_BIN, pre: ["-m", "yt_dlp"] });
  candidates.push({ cmd: "py", pre: ["-m", "yt_dlp"] });
  candidates.push({ cmd: "python3", pre: ["-m", "yt_dlp"] });
  candidates.push({ cmd: "python", pre: ["-m", "yt_dlp"] });

  for (const c of candidates) {
    try {
      await execFileP(c.cmd, [...c.pre, "--version"], { timeout: 15000 });
      RESOLVED = c;
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function viaYtDlp(videoId: string, lang?: string): Promise<YtDlpResult | null> {
  const bin = await resolveYtDlp();
  if (!bin) return null;

  const dir = await mkdtemp(join(tmpdir(), "ytsub-"));
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    // EXACT codes only — a ".*" glob also matches auto-translations (en-ar, en-hi, …),
    // which triggers a 429 storm. "-orig" is yt-dlp's name for the base auto-caption.
    const want = lang ? [lang, `${lang}-orig`] : ["hi", "en", "hi-orig", "en-orig"];
    const langArg = want.join(",");
    try {
      await execFileP(
        bin.cmd,
        [
          ...bin.pre, "--skip-download", "--write-subs", "--write-auto-subs",
          "--sub-langs", langArg, "--sub-format", "vtt", "--write-info-json",
          "--sleep-subtitles", "1", "--no-warnings", "--no-playlist",
          "-o", join(dir, "v.%(ext)s"), url,
        ],
        // Cap the wait: locally captions download in a few seconds; on a blocked
        // datacenter IP this fails fast so we fall through to the kome.ai fallback.
        { timeout: 25000, maxBuffer: 16 * 1024 * 1024 },
      );
    } catch {
      // A later track may 429 after an earlier one succeeded — keep what was written.
    }

    const files = await readdir(dir);
    let title = "";
    const info = files.find((f) => f.endsWith(".info.json"));
    if (info) {
      try { title = (JSON.parse(await readFile(join(dir, info), "utf8")).title as string) || ""; } catch {}
    }
    const subFiles = files.filter((f) => f.endsWith(".vtt"));
    if (!subFiles.length) return { title, available: [], chosen: null };

    const tracks = subFiles.map((f) => {
      const m = f.match(/\.([A-Za-z-]+)\.vtt$/);
      const raw = m ? m[1] : "und";
      return { file: f, code: raw.replace(/-orig$/, ""), auto: /orig|auto/i.test(raw) };
    });
    const base = (c: string) => c.split("-")[0];
    const available = tracks.map((t) => ({ code: t.code, name: INDIAN[base(t.code)] || t.code, auto: t.auto }));
    const score = (c: string) => {
      const b = base(c);
      if (lang && (c === lang || b === lang)) return 0;
      if (b === "hi") return 1;
      if (b === "en") return 2;
      return 3;
    };
    const ordered = [...tracks].sort((a, b) => score(a.code) - score(b.code));
    for (const t of ordered) {
      const vtt = await readFile(join(dir, t.file), "utf8");
      const text = parseVtt(vtt);
      if (text) return { title, available, chosen: { code: t.code, text, segments: vttSegments(vtt) } };
    }
    return { title, available, chosen: null };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Keyless transcript API (kome.ai) ─────────────────────────────────────────
// Fetches the transcript SERVER-SIDE from kome's own infrastructure, so it works
// even when the host IP is blocked by YouTube (e.g. Render/other datacenters, where
// yt-dlp + the direct caption endpoints all return nothing). No API key, no signup.
// It returns the video's native-language transcript (Hindi stays Hindi) as plain text
// (no timestamps / language-picker), which the analysis step then handles as usual.
async function fromKome(videoId: string): Promise<string> {
  try {
    const res = await fetch("https://kome.ai/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": WEB_UA },
      body: JSON.stringify({ video_id: videoId, format: true }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { transcript?: string };
    const raw = data.transcript || "";
    // drop [Music]/[Applause]-style markers, collapse whitespace
    return raw.replace(/\[[^\]]{1,24}\]/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

// Lightweight title lookup (oEmbed) for sources that don't return one.
async function fetchYtTitle(videoId: string): Promise<string> {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return "";
    const j = (await r.json()) as { title?: string };
    return j.title || "";
  } catch {
    return "";
  }
}

// In-memory cache so repeat fetches of the same video are instant (no slow re-download).
const CACHE = new Map<string, { at: number; payload: Record<string, unknown> }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  const { url, lang } = (await req.json()) as { url: string; lang?: string };
  const videoId = extractVideoId(url || "");
  if (!videoId) {
    return NextResponse.json({ ok: false, error: "Could not read a video ID from that URL." });
  }

  // Cache hit → return instantly (fixes slow repeat/"day 2" fetches)
  const cacheKey = `${videoId}:${lang || ""}`;
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return NextResponse.json({ ...hit.payload, cached: true });
  }

  // 0) yt-dlp first — reliably extracts captions/auto-subs including Hindi
  try {
    const y = await viaYtDlp(videoId, lang);
    if (y?.chosen) {
      const payload = {
        ok: true,
        transcript: formatTranscript(fixTerms(y.chosen.text)).slice(0, 60000),
        segments: y.chosen.segments.map((s) => ({ t: s.t, text: fixTerms(s.text) })),
        title: y.title,
        language: y.chosen.code,
        languageName: INDIAN[y.chosen.code.split("-")[0]] || y.chosen.code,
        available: y.available,
        videoId,
        engine: "yt-dlp",
      };
      CACHE.set(cacheKey, { at: Date.now(), payload });
      return NextResponse.json(payload);
    }
  } catch {
    /* yt-dlp unavailable or failed — fall back to direct fetch */
  }

  // 1) Keyless transcript API (kome.ai) — the reliable path when the host IP is
  //    blocked by YouTube (Render/datacenter), where yt-dlp above returns nothing.
  //    Runs after yt-dlp so local keeps the richer timestamped experience.
  try {
    const komeText = await fromKome(videoId);
    if (komeText.length > 40) {
      const hasDev = /[ऀ-ॿ]/.test(komeText);
      const title = await fetchYtTitle(videoId);
      const payload = {
        ok: true,
        transcript: formatTranscript(fixTerms(komeText)).slice(0, 60000),
        segments: [] as TSegment[],
        title,
        language: lang || (hasDev ? "hi" : "en"),
        languageName: hasDev ? "Hindi" : "English",
        available: [] as { code: string; name: string; auto: boolean }[],
        videoId,
        engine: "kome",
      };
      CACHE.set(cacheKey, { at: Date.now(), payload });
      return NextResponse.json(payload);
    }
  } catch {
    /* kome unavailable — fall back to direct YouTube fetch */
  }

  try {
    let player: PlayerData = { title: "", tracks: [] };
    try {
      player = await fromInnerTube(videoId);
    } catch {
      /* try HTML next */
    }
    if (!player.tracks.length) {
      try {
        const html = await fromWatchHtml(videoId);
        player = { title: player.title || html.title, tracks: html.tracks };
      } catch {
        /* handled below */
      }
    }

    const { title, tracks } = player;
    if (!tracks.length) {
      return NextResponse.json({
        ok: false,
        title,
        error:
          "This video has no captions YouTube can serve. In production the backend transcribes the audio with faster-whisper (Hindi/Hinglish). For now, paste the transcript manually.",
      });
    }

    const available = tracks.map((t) => ({
      code: t.languageCode,
      name: t.name?.simpleText || t.name?.runs?.[0]?.text || INDIAN[t.languageCode] || t.languageCode,
      auto: t.kind === "asr",
    }));

    const score = (t: Track) => {
      if (lang && (t.languageCode === lang || t.languageCode.startsWith(lang))) return 0;
      if (t.languageCode === "hi" || t.languageCode.startsWith("hi")) return 1;
      if (t.languageCode === "en" || t.languageCode.startsWith("en")) return 2;
      return 3;
    };
    const ordered = [...tracks].sort((a, b) => score(a) - score(b));

    for (const track of ordered) {
      const transcript = await fetchTranscriptText(track.baseUrl);
      if (transcript) {
        const payload = {
          ok: true,
          transcript: formatTranscript(fixTerms(transcript)).slice(0, 60000),
          segments: [] as TSegment[],
          title,
          language: track.languageCode,
          languageName: INDIAN[track.languageCode] || track.languageCode,
          available,
          videoId,
        };
        CACHE.set(cacheKey, { at: Date.now(), payload });
        return NextResponse.json(payload);
      }
    }

    return NextResponse.json({
      ok: false,
      title,
      available,
      error:
        "Captions are listed but YouTube returned no readable text. Pick a language above, try another video, " +
        "or paste the transcript — production uses faster-whisper on the audio.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({
      ok: false,
      error: `Couldn't fetch captions (${message}). Paste the transcript manually, or use the backend whisper engine.`,
    });
  }
}
