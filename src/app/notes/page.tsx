"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
            10s · POST <code>/api/notes</code> with markdown to update
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
          className="md"
          style={{
            background: "#0f141b",
            border: "1px solid #1f2937",
            borderRadius: 8,
            padding: 18,
            fontSize: 14,
            lineHeight: 1.6,
            minHeight: 200,
          }}
        >
          {!notes?.body?.length ? (
            <span style={{ color: "#6b7280" }}>no notes yet.</span>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: (props) => (
                  <img
                    {...props}
                    style={{
                      maxWidth: "100%",
                      height: "auto",
                      display: "block",
                      margin: "10px 0",
                      borderRadius: 4,
                    }}
                  />
                ),
                a: (props) => (
                  <a
                    {...props}
                    style={{ color: "#6bf", textDecoration: "underline" }}
                    target="_blank"
                    rel="noreferrer"
                  />
                ),
                code: (props) => (
                  <code
                    {...props}
                    style={{
                      background: "#141a22",
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                    }}
                  />
                ),
                pre: (props) => (
                  <pre
                    {...props}
                    style={{
                      background: "#0a0f15",
                      border: "1px solid #1f2937",
                      padding: 12,
                      borderRadius: 6,
                      overflowX: "auto",
                      fontSize: 12,
                    }}
                  />
                ),
                table: (props) => (
                  <table
                    {...props}
                    style={{
                      borderCollapse: "collapse",
                      margin: "10px 0",
                      fontSize: 13,
                    }}
                  />
                ),
                th: (props) => (
                  <th
                    {...props}
                    style={{
                      border: "1px solid #1f2937",
                      padding: "6px 10px",
                      background: "#141a22",
                      textAlign: "left",
                    }}
                  />
                ),
                td: (props) => (
                  <td
                    {...props}
                    style={{ border: "1px solid #1f2937", padding: "6px 10px" }}
                  />
                ),
                h1: (props) => (
                  <h1 {...props} style={{ fontSize: 20, margin: "16px 0 8px" }} />
                ),
                h2: (props) => (
                  <h2 {...props} style={{ fontSize: 17, margin: "14px 0 6px" }} />
                ),
                h3: (props) => (
                  <h3 {...props} style={{ fontSize: 15, margin: "12px 0 4px" }} />
                ),
              }}
            >
              {notes.body}
            </ReactMarkdown>
          )}
        </article>
      </div>
    </main>
  );
}
