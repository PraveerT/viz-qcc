"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Repr = {
  class_names: string[];
  proto_W: number[][];
  proto_b: number[];
  class_means: number[][];
  class_counts: number[];
  sample_2d: number[][];
  sample_labels: number[];
  proto_2d: number[][];
  mean_2d: number[][];
};

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function pairwiseSim(rows: number[][]): number[][] {
  const N = rows.length;
  const M: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      const v = cosineSim(rows[i], rows[j]);
      M[i][j] = v; M[j][i] = v;
    }
  }
  return M;
}

function colorMap(v: number): string {
  const t = (v + 1) / 2;
  const r = Math.round(255 * t);
  const b = Math.round(255 * (1 - t));
  const g = Math.round(255 * (1 - Math.abs(v)));
  return `rgb(${r},${g},${b})`;
}

function classColor(idx: number, n: number): string {
  const h = (idx * 360) / n;
  return `hsl(${h}, 70%, 50%)`;
}

function Heatmap({ M, names, title, hover, setHover }: {
  M: number[][]; names: string[]; title: string;
  hover: { i: number; j: number } | null;
  setHover: (h: { i: number; j: number } | null) => void;
}) {
  const N = M.length;
  const cell = 18;
  const pad = 70;
  const size = N * cell + pad * 2;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <svg width={size} height={size} style={{ background: "#0a0a0a" }}>
        {M.map((row, i) =>
          row.map((v, j) => (
            <rect
              key={`${i}-${j}`}
              x={pad + j * cell}
              y={pad + i * cell}
              width={cell}
              height={cell}
              fill={colorMap(v)}
              stroke={hover && hover.i === i && hover.j === j ? "#fff" : "none"}
              strokeWidth={1}
              onMouseEnter={() => setHover({ i, j })}
              onMouseLeave={() => setHover(null)}
            />
          ))
        )}
        {names.map((n, i) => (
          <text key={`r${i}`} x={pad - 4} y={pad + i * cell + cell / 2 + 3}
            fill="#aaa" fontSize={9} textAnchor="end">{n}</text>
        ))}
        {names.map((n, i) => (
          <text key={`c${i}`} x={pad + i * cell + cell / 2}
            y={pad - 4} fill="#aaa" fontSize={9}
            textAnchor="start"
            transform={`rotate(-45 ${pad + i * cell + cell / 2} ${pad - 4})`}>{n}</text>
        ))}
        {hover && (
          <text x={pad} y={pad + N * cell + 18} fill="#fff" fontSize={12}>
            {names[hover.i]} ↔ {names[hover.j]}: {M[hover.i][hover.j].toFixed(3)}
          </text>
        )}
      </svg>
    </div>
  );
}

function Scatter({ data }: { data: Repr }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 700, H = 600;
  const N = data.class_names.length;
  const [highlight, setHighlight] = useState<number | null>(null);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);
    const all = [...data.sample_2d, ...data.proto_2d, ...data.mean_2d];
    const xs = all.map(p => p[0]); const ys = all.map(p => p[1]);
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const pad = 30;
    const sx = (x: number) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
    const sy = (y: number) => pad + ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
    data.sample_2d.forEach((p, i) => {
      const cls = data.sample_labels[i];
      ctx.globalAlpha = (highlight !== null && cls !== highlight) ? 0.05 : 0.45;
      ctx.fillStyle = classColor(cls, N);
      ctx.beginPath(); ctx.arc(sx(p[0]), sy(p[1]), 2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    data.mean_2d.forEach((p, i) => {
      ctx.fillStyle = classColor(i, N);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(p[0]), sy(p[1]), 7, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });
    data.proto_2d.forEach((p, i) => {
      ctx.fillStyle = classColor(i, N);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      const x = sx(p[0]), y = sy(p[1]);
      ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.strokeRect(x - 5, y - 5, 10, 10);
    });
    ctx.font = "10px monospace";
    data.mean_2d.forEach((p, i) => {
      ctx.fillStyle = "#ddd";
      ctx.fillText(data.class_names[i], sx(p[0]) + 9, sy(p[1]) + 3);
    });
  }, [data, highlight]);

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        2D PCA of stage5 embeddings (1050 train samples)
      </div>
      <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>
        small dot = sample; circle = class mean; square = classifier prototype (stage6 row)
      </div>
      <canvas ref={ref} width={W} height={H} style={{ display: "block", background: "#0a0a0a" }} />
      <div style={{ marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "#aaa" }}>highlight class:</span>
        <select value={highlight ?? ""} onChange={e => setHighlight(e.target.value === "" ? null : Number(e.target.value))}
          style={{ marginLeft: 8, fontSize: 11, background: "#222", color: "#fff", border: "1px solid #444" }}>
          <option value="">all</option>
          {data.class_names.map((n, i) => <option key={i} value={i}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function ExtractionPage() {
  const [data, setData] = useState<Repr | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  useEffect(() => {
    fetch("/class_repr.json").then(r => r.json()).then(setData).catch(e => setErr(String(e)));
  }, []);

  const protoSim = useMemo(() => data ? pairwiseSim(data.proto_W) : null, [data]);
  const meanSim = useMemo(() => data ? pairwiseSim(data.class_means) : null, [data]);
  const protoMeanAlign = useMemo(() => {
    if (!data) return null;
    return data.proto_W.map((p, i) => cosineSim(p, data.class_means[i]));
  }, [data]);

  if (err) return <div style={{ color: "red", padding: 16 }}>error: {err}</div>;
  if (!data) return <div style={{ padding: 16, color: "#aaa" }}>loading...</div>;

  return (
    <main style={{ padding: 16, background: "#000", color: "#fff", fontFamily: "monospace", minHeight: "100vh" }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/" style={{ color: "#6af" }}>back to viz</a>
      </div>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Class representation extraction (PMamba baseline ep115, 90.04%)</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        {protoSim && (
          <Heatmap M={protoSim} names={data.class_names} title="Cosine sim: classifier prototypes (stage6 weights)" hover={hover} setHover={setHover} />
        )}
        {meanSim && (
          <Heatmap M={meanSim} names={data.class_names} title="Cosine sim: class-mean embeddings (stage5 output, train)" hover={hover} setHover={setHover} />
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Scatter data={data} />
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          Per-class prototype-mean alignment (cosine)
        </div>
        <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>
          High value = classifier direction matches empirical class centroid.
        </div>
        <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr><th style={{ textAlign: "left", padding: "2px 8px" }}>class</th>
                <th style={{ textAlign: "right", padding: "2px 8px" }}>cos(W_i, mean_i)</th>
                <th style={{ textAlign: "right", padding: "2px 8px" }}>n_train</th></tr>
          </thead>
          <tbody>
            {data.class_names.map((n, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 8px" }}>{n}</td>
                <td style={{ padding: "2px 8px", textAlign: "right", color: protoMeanAlign![i] > 0.5 ? "#7f7" : protoMeanAlign![i] > 0.2 ? "#ff7" : "#f77" }}>
                  {protoMeanAlign![i].toFixed(3)}
                </td>
                <td style={{ padding: "2px 8px", textAlign: "right", color: "#888" }}>{data.class_counts[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
