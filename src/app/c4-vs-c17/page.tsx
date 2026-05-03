"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Sample = {
  sample_id: string;
  true_class: number;       // 3 = c4, 16 = c17
  bin_pred: number;
  full_pred: number;
  logit_c4: number;
  logit_c17: number;
  frames_jpg_b64: string[];
};

type Data = {
  class_names: { [k: string]: string };
  samples: Sample[];
  network_binary_acc: number;
  network_full_acc: number;
  n_samples: number;
};

const C4 = 3, C17 = 16;

function ClipPlayer({ frames, label, t, fps }: { frames: string[]; label?: string; t: number; fps: number }) {
  const T = frames.length;
  const idx = T > 0 ? t % T : 0;
  return (
    <div style={{ display: "inline-block", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label || ""}</div>
      <img
        src={`data:image/jpeg;base64,${frames[idx]}`}
        style={{ width: 240, height: 180, imageRendering: "pixelated", background: "#000", border: "2px solid #333" }}
        alt={`frame ${idx + 1}/${T}`}
      />
      <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>frame {idx + 1}/{T}</div>
    </div>
  );
}

function pickPair(samples: Sample[], rng: () => number): [Sample, Sample, "LEFT" | "RIGHT"] {
  const c4s = samples.filter(s => s.true_class === C4);
  const c17s = samples.filter(s => s.true_class === C17);
  const a = c4s[Math.floor(rng() * c4s.length)];
  const b = c17s[Math.floor(rng() * c17s.length)];
  // randomize side
  const c4OnLeft = rng() < 0.5;
  if (c4OnLeft) return [a, b, "LEFT"];
  return [b, a, "RIGHT"];
}

export default function GamePage() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pair, setPair] = useState<[Sample, Sample, "LEFT" | "RIGHT"] | null>(null);
  const [picked, setPicked] = useState<"LEFT" | "RIGHT" | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [t, setT] = useState(0);
  const [fps, setFps] = useState(8);
  const [history, setHistory] = useState<{ correct: boolean; pair: [string, string] }[]>([]);

  useEffect(() => {
    fetch("/c4_vs_c17.json").then(r => r.json()).then(setData).catch(e => setErr(String(e)));
  }, []);

  // animation tick
  useEffect(() => {
    const id = setInterval(() => setT(p => p + 1), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);

  // pick a fresh pair when data loads
  useEffect(() => {
    if (data && !pair) setPair(pickPair(data.samples, Math.random));
  }, [data, pair]);

  const onPick = (side: "LEFT" | "RIGHT") => {
    if (picked || !pair) return;
    setPicked(side);
    const correct = side === pair[2];
    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    setHistory(h => [{ correct, pair: [pair[0].sample_id, pair[1].sample_id] }, ...h].slice(0, 20));
  };

  const next = () => {
    if (!data) return;
    setPair(pickPair(data.samples, Math.random));
    setPicked(null);
  };

  if (err) return <div style={{ color: "red", padding: 16 }}>error: {err}</div>;
  if (!data || !pair) return <div style={{ padding: 16, color: "#aaa" }}>loading…</div>;

  const userAcc = score.total > 0 ? score.correct / score.total : 0;
  const netAcc = data.network_binary_acc;

  const [left, right, c4Side] = pair;
  const correctSide = c4Side;
  const networkPickedLeft = left.bin_pred === C4;
  const networkPickedRight = right.bin_pred === C4;
  const networkChoice: "LEFT" | "RIGHT" | "TIE" =
    (networkPickedLeft && !networkPickedRight) ? "LEFT" :
    (!networkPickedLeft && networkPickedRight) ? "RIGHT" :
    (left.logit_c4 - left.logit_c17) > (right.logit_c4 - right.logit_c17) ? "LEFT" : "RIGHT";

  return (
    <main style={{ padding: 16, background: "#000", color: "#eee", fontFamily: "monospace", minHeight: "100vh" }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/" style={{ color: "#6af" }}>back</a>
        {" | "}
        <a href="/extraction" style={{ color: "#6af" }}>extraction</a>
      </div>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>
        Which is <span style={{ color: "#fde047" }}>class 4</span>?
      </h1>
      <div style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
        Pick the clip showing class 4 ("Move hand left", per NVGesture). The other is class 17 (the model's #1 confusion source).
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 24, alignItems: "center", fontSize: 13 }}>
        <div>
          <span style={{ color: "#6af" }}>YOU:</span>{" "}
          <span style={{ color: userAcc >= netAcc ? "#7f7" : "#fff" }}>
            {score.correct}/{score.total} ({(userAcc * 100).toFixed(1)}%)
          </span>
        </div>
        <div>
          <span style={{ color: "#fb923c" }}>PMamba 90.04:</span>{" "}
          <span style={{ color: "#fff" }}>{(netAcc * 100).toFixed(1)}%</span> ({Math.round(netAcc * data.n_samples)}/{data.n_samples})
        </div>
        <button onClick={() => { setScore({ correct: 0, total: 0 }); setHistory([]); next(); }}
          style={{ marginLeft: "auto", padding: "4px 10px", background: "#222", color: "#fff", border: "1px solid #444", cursor: "pointer" }}>
          reset
        </button>
      </div>

      <div style={{ display: "flex", gap: 24, justifyContent: "center", marginBottom: 16 }}>
        <div style={{ textAlign: "center" }}>
          <ClipPlayer frames={left.frames_jpg_b64} label="A" t={t} fps={fps} />
          <button
            disabled={!!picked}
            onClick={() => onPick("LEFT")}
            style={{
              display: "block",
              marginTop: 8,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              background: picked === "LEFT" ? (correctSide === "LEFT" ? "#16a34a" : "#dc2626") : "#1f2937",
              color: "#fff",
              border: "1px solid #444",
              cursor: picked ? "default" : "pointer",
              width: 240,
            }}
          >
            A is class 4
          </button>
        </div>
        <div style={{ textAlign: "center" }}>
          <ClipPlayer frames={right.frames_jpg_b64} label="B" t={t} fps={fps} />
          <button
            disabled={!!picked}
            onClick={() => onPick("RIGHT")}
            style={{
              display: "block",
              marginTop: 8,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              background: picked === "RIGHT" ? (correctSide === "RIGHT" ? "#16a34a" : "#dc2626") : "#1f2937",
              color: "#fff",
              border: "1px solid #444",
              cursor: picked ? "default" : "pointer",
              width: 240,
            }}
          >
            B is class 4
          </button>
        </div>
      </div>

      {picked && (
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            {picked === correctSide ? (
              <span style={{ color: "#22c55e" }}>correct! ({correctSide} was class 4)</span>
            ) : (
              <span style={{ color: "#ef4444" }}>wrong — {correctSide} was class 4</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#888" }}>
            PMamba picked: <b style={{ color: networkChoice === correctSide ? "#7f7" : "#f77" }}>{networkChoice}</b>
            {" | "}
            A logits: c4={left.logit_c4.toFixed(2)} c17={left.logit_c17.toFixed(2)}
            {" | "}
            B logits: c4={right.logit_c4.toFixed(2)} c17={right.logit_c17.toFixed(2)}
          </div>
          <button
            onClick={next}
            style={{ marginTop: 10, padding: "8px 18px", fontSize: 14, background: "#0f766e", color: "#fff", border: "1px solid #444", cursor: "pointer" }}
          >
            next →
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, fontSize: 11, color: "#aaa" }}>
        <span>fps</span>
        <input type="range" min={2} max={20} value={fps} onChange={e => setFps(parseInt(e.target.value))} style={{ width: 200 }} />
        <span>{fps}</span>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 11, color: "#888" }}>
          recent: {history.map((h, i) => (
            <span key={i} style={{ marginRight: 8, color: h.correct ? "#7f7" : "#f77" }}>
              {h.correct ? "✓" : "✗"}
            </span>
          ))}
        </div>
      )}
    </main>
  );
}
