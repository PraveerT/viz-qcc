"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const PATTERNS = [
  { name: "Static", desc: "no rotation", fn: () => 0, color: "#78716c" },
  { name: "Slow +", desc: "angle = 0.3t", fn: (t: number) => t * 0.3, color: "#2563eb" },
  { name: "Fast +", desc: "angle = 1.0t", fn: (t: number) => t * 1.0, color: "#4f46e5" },
  { name: "Slow -", desc: "angle = -0.3t", fn: (t: number) => -t * 0.3, color: "#0891b2" },
  { name: "Fast -", desc: "angle = -1.0t", fn: (t: number) => -t * 1.0, color: "#7c3aed" },
  { name: "Slow Osc", desc: "0.5 sin(2t)", fn: (t: number) => Math.sin(t * 2) * 0.5, color: "#16a34a" },
  { name: "Fast Osc", desc: "0.25 sin(4t)", fn: (t: number) => Math.sin(t * 4) * 0.25, color: "#ca8a04" },
  { name: "Step", desc: "kick at t=π", fn: (t: number) => (t > Math.PI ? (t - Math.PI) * 0.5 : 0), color: "#dc2626" },
];

const N_FRAMES = 32;
const N_POINTS = 128;

type Pt = { x: number; y: number; isPalm: boolean };

function generateHand(): Pt[] {
  const pts: Pt[] = [];
  // Use a fixed seed-like sampling so the cloud is stable across mounts
  let s = 1;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < N_POINTS / 2; i++) {
    pts.push({ x: (rand() - 0.5) * 0.2, y: (rand() - 0.5) * 0.2, isPalm: true });
  }
  for (let i = 0; i < N_POINTS / 2; i++) {
    pts.push({ x: (rand() - 0.5) * 0.1, y: Math.abs(rand() * 0.05) + 0.15, isPalm: false });
  }
  return pts;
}

export default function BigPointCloud() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const baseRef = useRef<Pt[] | null>(null);
  const animRef = useRef<number>(0);
  const [patternIdx, setPatternIdx] = useState(1);
  const [playing, setPlaying] = useState(true);

  const pattern = PATTERNS[patternIdx];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!baseRef.current) baseRef.current = generateHand();
    const base = baseRef.current;

    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);

    const t = ((frameRef.current % N_FRAMES) / N_FRAMES) * 2 * Math.PI;
    const angle = pattern.fn(t);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // faint trajectory circle
    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.15, 0, Math.PI * 2);
    ctx.stroke();

    const radius = Math.min(W, H) * 0.15;
    const tx = Math.cos(t) * radius;
    const ty = Math.sin(t) * radius;

    const scale = Math.min(W, H) * 1.4;
    const cx = W / 2 + tx;
    const cy = H / 2 + ty;

    for (const pt of base) {
      const rx = pt.x * cos - pt.y * sin;
      const ry = pt.x * sin + pt.y * cos;
      const sx = cx + rx * scale;
      const sy = cy - ry * scale;
      const size = pt.isPalm ? 4 : 5;
      ctx.fillStyle = pt.isPalm ? "rgba(148, 163, 184, 0.75)" : pattern.color;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // angle dial (top-right)
    ctx.strokeStyle = pattern.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const arcR = 28;
    const startAngle = -Math.PI / 2;
    ctx.arc(W - 60, 60, arcR, startAngle, startAngle - angle, angle > 0);
    ctx.stroke();
    ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
    ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`angle ${angle.toFixed(2)}`, W - 140, 104);

    // frame counter (bottom-left)
    ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
    ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(
      `frame ${(frameRef.current % N_FRAMES).toString().padStart(2, "0")} / ${N_FRAMES - 1}`,
      20,
      H - 20
    );
    ctx.fillText(`N = ${N_POINTS} points`, 20, H - 42);

    frameRef.current++;
    if (playing) animRef.current = requestAnimationFrame(draw);
  }, [pattern, playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const side = Math.min(window.innerWidth - 48, window.innerHeight - 200);
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
    if (playing) {
      animRef.current = requestAnimationFrame(draw);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [draw, playing]);

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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
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
          QCC · 128-point sample
        </h1>
        <p style={{ fontSize: "0.82rem", color: "#64748b", margin: 0 }}>
          {pattern.name} — {pattern.desc}
        </p>
      </div>

      <canvas
        ref={canvasRef}
        style={{ borderRadius: 12, border: "1px solid #1e293b", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", justifyContent: "center", maxWidth: 720 }}>
        {PATTERNS.map((p, i) => (
          <button
            key={p.name}
            onClick={() => {
              setPatternIdx(i);
              frameRef.current = 0;
            }}
            style={{
              background: i === patternIdx ? p.color : "transparent",
              color: i === patternIdx ? "#fff" : p.color,
              border: `1px solid ${p.color}`,
              padding: "0.45rem 0.9rem",
              borderRadius: 6,
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {p.name}
          </button>
        ))}
        <button
          onClick={() => setPlaying((v) => !v)}
          style={{
            background: playing ? "#1e293b" : "#10b981",
            color: "#fff",
            border: "1px solid #334155",
            padding: "0.45rem 0.9rem",
            borderRadius: 6,
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
            marginLeft: "0.5rem",
          }}
        >
          {playing ? "pause" : "play"}
        </button>
      </div>
    </div>
  );
}
