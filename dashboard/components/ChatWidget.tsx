"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/Icon";
import type { ChatMessage } from "@/lib/types";

// Floating, Lenskart/Intercom-style AI assistant bubble. Fixed bottom-right, opens a rounded
// chat panel. Answers about the currently-loaded video (grounded in its transcript) or, when no
// video is loaded, about DeoDap / how to use the tool. Reuses /api/chat — no extra credentials.
const BRAND_CONTEXT = `DeoDap (deodap.in) is an Indian wholesale / reseller platform selling kitchenware,
home goods, gadgets and travel accessories at factory-direct prices — for households, retail stores and
online resellers across India. This tool (DeoDap Blog Drafter) turns a YouTube product video into an
SEO blog: paste a video URL, it fetches the transcript, extracts every product, matches them to deodap.in
(image, price, rating), writes the blog and can draft it to Shopify. Answer the user's questions helpfully
in clear English.`;

export function ChatWidget({ transcript }: { transcript?: string }) {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, busy, open]);

  const grounded = !!(transcript && transcript.trim().length > 40);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const history = chat;
    setChat([...history, { role: "user", text: q }]);
    setBusy(true);
    try {
      const d = await (
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: grounded ? transcript : BRAND_CONTEXT, question: q, history }),
        })
      ).json();
      setChat((c) => [...c, { role: "assistant", text: d.answer || "Sorry, I couldn't answer that — try rephrasing." }]);
    } catch {
      setChat((c) => [...c, { role: "assistant", text: "Network error — please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={`cw-fab ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        title="Ask DeoDap AI"
      >
        <Icon name={open ? "close" : "spark"} size={24} />
      </button>

      {open && (
        <div className="cw-panel" role="dialog" aria-label="DeoDap AI assistant">
          <div className="cw-head">
            <span className="cw-dot" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t">DeoDap AI Assistant</div>
              <div className="s">{grounded ? "Answers about this video" : "Ask anything about DeoDap"}</div>
            </div>
            <button className="cw-x" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button>
          </div>

          <div className="cw-log" ref={logRef}>
            {chat.length === 0 ? (
              <div className="cw-msg bot">
                Hi! I&apos;m your DeoDap assistant. {grounded
                  ? "Ask me about the products, prices or reviews in this video."
                  : "Ask me about DeoDap products or how to turn a video into a blog."}
              </div>
            ) : (
              chat.map((m, i) => <div key={i} className={`cw-msg ${m.role === "user" ? "user" : "bot"}`}>{m.text}</div>)
            )}
            {busy && <div className="cw-msg bot cw-typing">…</div>}
          </div>

          <div className="cw-input">
            <textarea
              rows={1}
              placeholder="Type your question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button className="cw-send" onClick={send} disabled={busy || !input.trim()} aria-label="Send">
              <Icon name="arrowUp" size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
