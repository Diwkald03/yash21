"use client";

import { useState } from "react";
import { Icon } from "./Icon";

type Mode = "login" | "register" | "forgot" | "reset";
interface SafeUser { id: string; name: string; email: string; createdAt: string }

const COPY: Record<Mode, { h: string; p: string; cta: string }> = {
  login: { h: "Welcome back", p: "Log in to your DeoDap Blog Drafter.", cta: "Sign in" },
  register: { h: "Create your account", p: "Just your name, email and a password — no card needed.", cta: "Create free account" },
  forgot: { h: "Forgot password?", p: "We'll email you a reset code.", cta: "Send reset code" },
  reset: { h: "Set a new password", p: "Enter the code we sent you.", cta: "Reset password" },
};

const FEATURES = [
  "YouTube video → SEO blog in minutes",
  "Auto product & collection linking",
  "1-click Shopify draft, ready to review",
];

export function AuthScreen({ onAuthed }: { onAuthed: (u: SafeUser) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [keep, setKeep] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function post(path: string, body: Record<string, unknown>) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  }
  function go(m: Mode) { setMode(m); setErr(""); setOk(""); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setOk("");
    try {
      if (mode === "login") {
        const d = await post("/api/auth/login", { email, password });
        if (d.error) throw new Error(d.error);
        onAuthed(d.user);
      } else if (mode === "register") {
        const d = await post("/api/auth/register", { name, email, password });
        if (d.error) throw new Error(d.error);
        onAuthed(d.user);
      } else if (mode === "forgot") {
        const d = await post("/api/auth/forgot", { email });
        if (d.error) throw new Error(d.error);
        setMode("reset"); setErr("");
        setOk(d.devCode ? `Email isn't configured — dev reset code: ${d.devCode}`
          : "If that email is registered, a reset code is on its way.");
      } else {
        const d = await post("/api/auth/reset", { email, code, password });
        if (d.error) throw new Error(d.error);
        setMode("login"); setPassword(""); setCode("");
        setOk("Password updated — sign in with your new password.");
      }
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  const c = COPY[mode];

  return (
    <div className="auth-split">
      {/* left brand panel */}
      <aside className="auth-brandside">
        <div className="bs-logo">
          <span className="nm">DeoDap</span>
        </div>
        <div className="bs-mid">
          <h2 className="bs-head">The blog engine your DeoDap team will love.</h2>
          <p className="bs-desc">
            Turn every YouTube video into a branded, SEO-ready Shopify blog — transcript,
            analysis, product links and a publish-ready draft, all in one place.
          </p>
          <div className="bs-list">
            {FEATURES.map((f) => (
              <div key={f} className="bs-li"><span className="ck"><Icon name="check" size={15} strokeWidth={2.4} /></span>{f}</div>
            ))}
          </div>
        </div>
        <p className="bs-quote">&ldquo;DeoDap cut our blog setup from a few hours to a few minutes — and the drafts land straight in Shopify for review.&rdquo;</p>
      </aside>

      {/* right form panel */}
      <main className="auth-formside">
        <div className="fs-inner">
          <h1 className="fs-h">{c.h}</h1>
          <p className="fs-p">{c.p}</p>

          {err && <div className="fs-note warn">{err}</div>}
          {ok && <div className="fs-note good">{ok}</div>}

          <form onSubmit={submit}>
            {mode === "register" && (
              <div className="lf-field">
                <div className="lf-row"><label className="lf-label" htmlFor="name">Name</label></div>
                <input id="name" className="lf-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
              </div>
            )}

            {mode !== "reset" && (
              <div className="lf-field">
                <div className="lf-row"><label className="lf-label" htmlFor="email">Email address</label></div>
                <input id="email" className="lf-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
              </div>
            )}

            {mode === "reset" && (
              <>
                <div className="lf-field">
                  <div className="lf-row"><label className="lf-label" htmlFor="email">Email address</label></div>
                  <input id="email" className="lf-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
                </div>
                <div className="lf-field">
                  <div className="lf-row"><label className="lf-label" htmlFor="code">Reset code</label></div>
                  <input id="code" className="lf-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" required />
                </div>
              </>
            )}

            {mode !== "forgot" && (
              <div className="lf-field">
                <div className="lf-row">
                  <label className="lf-label" htmlFor="password">{mode === "reset" ? "New password" : "Password"}</label>
                  {mode === "login" && <button type="button" className="lf-forgot" onClick={() => go("forgot")}>Forgot?</button>}
                </div>
                <div className="lf-pw-wrap">
                  <input id="password" className="lf-input has-eye" type={showPw ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                  <button type="button" className="lf-eye" onClick={() => setShowPw((v) => !v)} aria-label="Toggle password">
                    <Icon name={showPw ? "eyeOff" : "eye"} size={16} />
                  </button>
                </div>
              </div>
            )}

            {mode === "login" && (
              <div className="lf-field" style={{ marginTop: 4 }}>
                <label className="lf-keep"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep me logged in</label>
              </div>
            )}

            <button className="lf-btn" type="submit" disabled={busy}>
              {busy ? <span className="spin light" /> : null}
              {c.cta} {!busy && <span aria-hidden>→</span>}
            </button>
          </form>

          <div className="fs-foot">
            {mode === "login" && <>New to DeoDap? <button onClick={() => go("register")}>Create a free account</button></>}
            {mode === "register" && <>Already have an account? <button onClick={() => go("login")}>Sign in</button></>}
            {(mode === "forgot" || mode === "reset") && <button onClick={() => go("login")}>Back to sign in</button>}
          </div>
        </div>
      </main>
    </div>
  );
}
