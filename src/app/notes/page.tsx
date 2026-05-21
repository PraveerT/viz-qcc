"use client";

import { useEffect, useState } from "react";

type Notes = { title?: string; body: string; updated_at: number };

const POLL_MS = 10000;

function fmtAge(updatedAt: number): string {
  if (!updatedAt) return "never";
  const sec = Math.round((Date.now() - updatedAt) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

export default function Page() {
  const [notes, setNotes] = useState<Notes | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/notes", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j: Notes = await r.json();
        if (!cancelled) {
          setNotes(j);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <main
      style={{
        background: "#0b0f14",
        color: "#e5e7eb",
        minHeight: "100vh",
        padding: "20px 18px 32px",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <a
          href="/anemon"
          style={{
            display: "inline-block",
            color: "#9ca3af",
            textDecoration: "none",
            fontSize: 13,
            padding: "6px 12px",
            border: "1px solid #1f2937",
            borderRadius: 6,
            background: "#0f141b",
          }}
        >
          ← anemon
        </a>

        <header style={{ marginTop: 18, marginBottom: 12 }}>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>
            {notes?.title?.trim() ? notes.title : "Notes"}
          </h1>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
            updated {fmtAge(notes?.updated_at ?? 0)} · auto-refreshes every
            10s · POST <code>/api/notes</code> to update
          </div>
        </header>

        {err && (
          <div
            style={{
              color: "#f88",
              border: "1px solid #4a1f1f",
              background: "#1a0e0e",
              padding: 10,
              borderRadius: 6,
              marginBottom: 12,
              fontSize: 12,
            }}
          >
            {err}
          </div>
        )}

        <article
          style={{
            background: "#0f141b",
            border: "1px solid #1f2937",
            borderRadius: 8,
            padding: 18,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            fontSize: 13,
            lineHeight: 1.55,
            minHeight: 200,
          }}
        >
          {!notes?.body?.length ? (
            "no notes yet."
          ) : (
            notes.body.split("\n").map((line, i) => {
              // Markdown image: ![alt](url)
              const img = line.match(/^!\[(.*?)\]\((.+?)\)$/);
              if (img) {
                return (
                  <img
                    key={i}
                    src={img[2]}
                    alt={img[1]}
                    style={{
                      maxWidth: "100%",
                      height: "auto",
                      display: "block",
                      margin: "8px 0",
                      borderRadius: 4,
                    }}
                  />
                );
              }
              // Bare image URL on its own line
              if (/^https?:\/\/\S+\.(gif|png|jpe?g|webp|svg)(\?.*)?$/i.test(line.trim())) {
                return (
                  <img
                    key={i}
                    src={line.trim()}
                    alt=""
                    style={{
                      maxWidth: "100%",
                      height: "auto",
                      display: "block",
                      margin: "8px 0",
                      borderRadius: 4,
                    }}
                  />
                );
              }
              return <div key={i}>{line || " "}</div>;
            })
          )}
        </article>
      </div>
    </main>
  );
}
