"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Sample = {
  class: string;
  label: number;
  subject: string;
  frames: number[][][]; // [T][N][3]
};

const N_POINTS = 128;

export default function BigPointCloud() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const animRef = useRef<number>(0);
  const yawRef = useRef(0);

  const [sample, setSample] = useState<Sample | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [autoSpin, setAutoSpin] = useState(true);
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0.25);
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    fetch("/sample_128.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((j: Sample) => setSample(j))
      .catch((e) => setErr(String(e)));
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sample) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);

    const T = sample.frames.length;
    const fi = frameRef.current % T;
    const pts = sample.frames[fi];

    const y = yawRef.current;
    const cy = Math.cos(y), sy = Math.sin(y);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);

    const scale = Math.min(W, H) * 0.42;
    const ox = W / 2;
    const oy = H / 2;

    const projected: { sx: number; sy: number; depth: number }[] = [];
    for (const p of pts) {
      const x = p[0], py = p[1], pz = p[2];
      const x1 = x * cy + pz * sy;
      const z1 = -x * sy + pz * cy;
      const y1 = py * cp - z1 * sp;
      const z2 = py * sp + z1 * cp;
      projected.push({
        sx: ox + x1 * scale,
        sy: oy - y1 * scale,
        depth: z2,
      });
    }

    let dmin = Infinity, dmax = -Infinity;
    for (const p of projected) { if (p.depth < dmin) dmin = p.depth; if (p.depth > dmax) dmax = p.depth; }
    const drange = Math.max(1e-6, dmax - dmin);

    projected.sort((a, b) => a.depth - b.depth);

    for (const p of projected) {
      const t01 = (p.depth - dmin) / drange;
      const size = 3 + (1 - t01) * 4;
      const hue = 210 - t01 * 60;
      const light = 55 + (1 - t01) * 25;
      const alpha = 0.55 + (1 - t01) * 0.4;
      ctx.fillStyle = `hsla(${hue}, 85%, ${light}%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(148,163,184,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, scale * 1.05, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`frame ${fi.toString().padStart(2, "0")} / ${T - 1}`, 20, H - 42);
    ctx.fillText(`N = ${N_POINTS} sampled from 512`, 20, H - 20);
    ctx.fillText(`yaw ${yawRef.current.toFixed(2)}  pitch ${pitch.toFixed(2)}`, W - 240, H - 20);

    if (autoSpin) yawRef.current += 0.012;
    if (playing) {
      frameRef.current = (frameRef.current + 1) % T;
      setFrameIdx(frameRef.current);
    }
    animRef.current = requestAnimationFrame(draw);
  }, [sample, playing, autoSpin, pitch]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const side = Math.min(window.innerWidth - 48, window.innerHeight - 220);
      const px = Math.max(360, side);
      canvas.width = px;
      canvas.height = px;
      canvas.style.width = `${px}px`;
      canvas.style.height = `${px}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (!sample) return;
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw, sample]);

  useEffect(() => {
    yawRef.current = yaw;
  }, [yaw]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b1220",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "1.5rem",
        gap: "1rem",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
        <h1
          style={{
            fontSize: "1.1rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#94a3b8",
            margin: 0,
          }}
        >
          Nvidia gesture · real sample
        </h1>
        {sample && (
          <p style={{ fontSize: "0.82rem", color: "#64748b", margin: 0 }}>
            {sample.class} · label {sample.label} · {sample.subject} · 32 frames × 128 pts
          </p>
        )}
        {err && <p style={{ color: "#f87171", fontSize: "0.85rem" }}>Failed to load sample: {err}</p>}
      </div>

      <canvas
        ref={canvasRef}
        style={{ borderRadius: 12, border: "1px solid #1e293b", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", justifyContent: "center", maxWidth: 820 }}>
        <button
          onClick={() => setPlaying((v) => !v)}
          style={btn(playing ? "#1e293b" : "#10b981")}
        >
          {playing ? "pause" : "play"}
        </button>
        <button
          onClick={() => setAutoSpin((v) => !v)}
          style={btn(autoSpin ? "#1e293b" : "#6366f1")}
        >
          {autoSpin ? "stop spin" : "auto spin"}
        </button>

        <label style={labelStyle}>
          yaw
          <input
            type="range"
            min={-Math.PI}
            max={Math.PI}
            step={0.01}
            value={yaw}
            onChange={(e) => {
              setYaw(parseFloat(e.target.value));
              setAutoSpin(false);
            }}
            style={{ width: 140 }}
          />
        </label>
        <label style={labelStyle}>
          pitch
          <input
            type="range"
            min={-1.2}
            max={1.2}
            step={0.01}
            value={pitch}
            onChange={(e) => setPitch(parseFloat(e.target.value))}
            style={{ width: 140 }}
          />
        </label>
        <label style={labelStyle}>
          frame
          <input
            type="range"
            min={0}
            max={Math.max(0, (sample?.frames.length ?? 1) - 1)}
            step={1}
            value={frameIdx}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              frameRef.current = v;
              setFrameIdx(v);
              setPlaying(false);
            }}
            style={{ width: 160 }}
          />
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.78rem" }}>
            {frameIdx.toString().padStart(2, "0")}
          </span>
        </label>
      </div>
    </div>
  );
}

const btn = (bg: string): React.CSSProperties => ({
  background: bg,
  color: "#fff",
  border: "1px solid #334155",
  padding: "0.5rem 1rem",
  borderRadius: 6,
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
});

const labelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  color: "#cbd5e1",
  fontSize: "0.8rem",
};
