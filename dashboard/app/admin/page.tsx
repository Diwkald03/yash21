"use client";

import { useEffect, useState } from "react";

interface Draft { id: string; title: string; createdAt: string; videoId: string | null; hasBlog: boolean; published: string | null; simulated: boolean | null }
interface UserRow { id: string; name: string; email: string; createdAt: string; drafts: Draft[] }
interface Data { db: string; userCount: number; sourceCount: number; users: UserRow[] }

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key") || "";
    if (k) { setKey(k); load(k); }
  }, []);

  async function load(k: string) {
    setBusy(true); setErr("");
    try {
      const d = await (await fetch(`/api/admin/data?key=${encodeURIComponent(k)}`)).json();
      if (d.error) { setErr(d.error); setData(null); } else { setData(d); }
    } catch { setErr("Network error"); } finally { setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 60px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px", color: "var(--txt)" }}>User data</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 20px" }}>
        Everyone who signed up and the drafts they created.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 22, maxWidth: 460 }}>
        <input className="input" style={{ flex: 1 }} placeholder="Admin key" aria-label="Admin key" value={key}
          onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(key)} />
        <button className="btn accent" onClick={() => load(key)} disabled={busy || !key}>
          {busy ? "Loading…" : "View"}
        </button>
      </div>

      {err && <div className="note warn" style={{ maxWidth: 560 }}>{err}</div>}

      {data && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <span className="chip">Database: {data.db === "postgres" ? "Postgres" : "File"}</span>
            <span className="chip">{data.userCount} users</span>
            <span className="chip">{data.sourceCount} drafts</span>
          </div>

          {data.users.length === 0 && <div className="acard">No users yet.</div>}

          {data.users.map((u) => (
            <div key={u.id} className="acard" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{u.name}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>{u.email}</div>
                </div>
                <div style={{ color: "var(--muted-2)", fontSize: 12 }}>
                  joined {u.createdAt.slice(0, 10)} · {u.drafts.length} draft{u.drafts.length === 1 ? "" : "s"}
                </div>
              </div>

              {u.drafts.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 600 }}>Title</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600 }}>Date</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {u.drafts.map((d) => (
                      <tr key={d.id} style={{ borderTop: "1px solid var(--line-soft)" }}>
                        <td style={{ padding: "8px 8px" }}>{d.title}</td>
                        <td style={{ padding: "8px 8px", color: "var(--muted)" }}>{d.createdAt.slice(0, 10)}</td>
                        <td style={{ padding: "8px 8px" }}>
                          {d.published
                            ? <a href={d.published} target="_blank" rel="noreferrer">{d.simulated ? "demo draft" : "Shopify draft"}</a>
                            : d.hasBlog ? <span className="badge b-info">blog ready</span>
                            : <span className="badge b-medium">not processed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
