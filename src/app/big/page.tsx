"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Sample = {
  class: string;
  label: number;
  subject: string;
  mode?: "raw" | "correspondence";
  held_per_frame?: number[];
  frames: number[][][]; // [T][N][3]
};

type Mode = "raw" | "correspondence";
const SAMPLE_URLS: Record<Mode, string> = {
  raw: "/sample_128.json",
  correspondence: "/sample_128_corr.json",
};

const N_POINTS = 128;

const SPEED_PRESETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8];

export default function BigPointCloud() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameAccumRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const animRef = useRef<number>(0);
  const yawRef = useRef(0);
  const speedRef = useRef(1);

  const [samples, setSamples] = useState<Partial<Record<Mode, Sample>>>({});
  const [mode, setMode] = useState<Mode>("raw");
  const sample = samples[mode] ?? null;
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [autoSpin, setAutoSpin] = useState(true);
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0.25);
  const [frameIdx, setFrameIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showIds, setShowIds] = useState(true);
  const [idFontPx, setIdFontPx] = useState(9);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    (Object.keys(SAMPLE_URLS) as Mode[]).forEach((m) => {
      fetch(SAMPLE_URLS[m])
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${m}: ${r.status}`))))
        .then((j: Sample) => setSamples((s) => ({ ...s, [m]: j })))
        .catch((e) => setErr(String(e)));
    });
  }, []);

  const draw = useCallback((ts?: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !sample) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);

    const T = sample.frames.length;
    const BASE_FPS = 30;
    const now = ts ?? performance.now();
    const last = lastTsRef.current ?? now;
    const dt = Math.min(0.1, (now - last) / 1000);
    lastTsRef.current = now;
    if (playing) {
      frameAccumRef.current = (frameAccumRef.current + dt * BASE_FPS * speedRef.current) % T;
    }
    const fi = Math.floor(((frameAccumRef.current % T) + T) % T);
    const pts = sample.frames[fi];

    const y = yawRef.current;
    const cy = Math.cos(y), sy = Math.sin(y);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);

    const scale = Math.min(W, H) * 0.42;
    const ox = W / 2;
    const oy = H / 2;

    const projected: { sx: number; sy: number; depth: number; idx: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const x = p[0], py = p[1], pz = p[2];
      const x1 = x * cy + pz * sy;
      const z1 = -x * sy + pz * cy;
      const y1 = py * cp - z1 * sp;
      const z2 = py * sp + z1 * cp;
      projected.push({
        sx: ox + x1 * scale,
        sy: oy - y1 * scale,
        depth: z2,
        idx: i,
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

    if (showIds) {
      ctx.font = `${idFontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = "middle";
      for (const p of projected) {
        const t01 = (p.depth - dmin) / drange;
        const size = 3 + (1 - t01) * 4;
        ctx.fillStyle = `rgba(226, 232, 240, ${0.55 + (1 - t01) * 0.4})`;
        ctx.fillText(p.idx.toString(), p.sx + size + 1.5, p.sy);
      }
    }

    ctx.strokeStyle = "rgba(148,163,184,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, scale * 1.05, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`frame ${fi.toString().padStart(2, "0")} / ${T - 1}`, 20, H - 62);
    ctx.fillText(`N = ${N_POINTS} sampled from 512`, 20, H - 40);
    ctx.fillText(`speed ${speedRef.current.toFixed(2)}x`, 20, H - 18);
    ctx.fillText(`yaw ${yawRef.current.toFixed(2)}  pitch ${pitch.toFixed(2)}`, W - 240, H - 18);

    if (autoSpin) yawRef.current += 0.012 * Math.max(0.25, speedRef.current);
    if (fi !== frameIdx) setFrameIdx(fi);
    animRef.current = requestAnimationFrame(draw);
  }, [sample, playing, autoSpin, pitch, frameIdx, showIds, idFontPx]);

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
            {sample.class} · label {sample.label} · {sample.subject} · 32 frames × 128 pts · <span style={{ color: mode === "raw" ? "#60a5fa" : "#f59e0b", fontWeight: 600 }}>{mode}</span>
            {mode === "correspondence" && sample.held_per_frame && (
              <span style={{ marginLeft: 8, color: "#475569" }}>
                · {sample.held_per_frame.reduce((a, b) => a + b, 0)}/{128 * (sample.frames.length - 1)} holds
              </span>
            )}
          </p>
        )}
        {err && <p style={{ color: "#f87171", fontSize: "0.85rem" }}>Failed to load sample: {err}</p>}

        <div style={{ display: "inline-flex", marginTop: "0.5rem", border: "1px solid #334155", borderRadius: 6, overflow: "hidden" }}>
          {(Object.keys(SAMPLE_URLS) as Mode[]).map((m) => {
            const active = mode === m;
            const color = m === "raw" ? "#60a5fa" : "#f59e0b";
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={!samples[m]}
                style={{
                  background: active ? color : "transparent",
                  color: active ? "#0b1220" : samples[m] ? color : "#475569",
                  border: "none",
                  padding: "0.45rem 1.1rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: samples[m] ? "pointer" : "not-allowed",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
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
        <button
          onClick={() => setShowIds((v) => !v)}
          style={btn(showIds ? "#0891b2" : "#1e293b")}
        >
          {showIds ? "hide ids" : "show ids"}
        </button>
        <label style={labelStyle}>
          id size
          <input
            type="range"
            min={7}
            max={18}
            step={1}
            value={idFontPx}
            onChange={(e) => setIdFontPx(parseInt(e.target.value))}
            style={{ width: 100 }}
          />
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.78rem" }}>
            {idFontPx}px
          </span>
        </label>

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
          speed
          <input
            type="range"
            min={0.05}
            max={8}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            style={{ width: 160 }}
          />
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.78rem", minWidth: 44, textAlign: "right" }}>
            {speed.toFixed(2)}x
          </span>
        </label>
        <div style={{ display: "inline-flex", gap: "0.25rem" }}>
          {SPEED_PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                background: Math.abs(speed - s) < 1e-3 ? "#2563eb" : "transparent",
                color: Math.abs(speed - s) < 1e-3 ? "#fff" : "#93c5fd",
                border: "1px solid #2563eb",
                padding: "0.3rem 0.55rem",
                borderRadius: 4,
                fontSize: "0.72rem",
                fontFamily: "ui-monospace, monospace",
                cursor: "pointer",
              }}
            >
              {s}x
            </button>
          ))}
        </div>

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
              frameAccumRef.current = v;
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
