"use client";

import { useEffect, useRef, useCallback } from "react";

const PATTERNS: {
  name: string;
  desc: string;
  fn: (t: number) => number;
  color: string;
}[] = [
  {
    name: "Static",
    desc: "No rotation",
    fn: () => 0,
    color: "#78716c",
  },
  {
    name: "Slow +",
    desc: "angle = 0.3t",
    fn: (t) => t * 0.3,
    color: "#2563eb",
  },
  {
    name: "Fast +",
    desc: "angle = 1.0t",
    fn: (t) => t * 1.0,
    color: "#4f46e5",
  },
  {
    name: "Slow -",
    desc: "angle = -0.3t",
    fn: (t) => -t * 0.3,
    color: "#0891b2",
  },
  {
    name: "Fast -",
    desc: "angle = -1.0t",
    fn: (t) => -t * 1.0,
    color: "#7c3aed",
  },
  {
    name: "Slow Osc",
    desc: "0.5 sin(2t)",
    fn: (t) => Math.sin(t * 2) * 0.5,
    color: "#16a34a",
  },
  {
    name: "Fast Osc",
    desc: "0.25 sin(4t)",
    fn: (t) => Math.sin(t * 4) * 0.25,
    color: "#ca8a04",
  },
  {
    name: "Step",
    desc: "kick at t=pi",
    fn: (t) => (t > Math.PI ? (t - Math.PI) * 0.5 : 0),
    color: "#dc2626",
  },
];

const N_FRAMES = 32;
const N_POINTS = 64;

function generateBaseHand(): { x: number; y: number; isPalm: boolean }[] {
  const pts: { x: number; y: number; isPalm: boolean }[] = [];
  for (let i = 0; i < N_POINTS / 2; i++) {
    pts.push({
      x: (Math.random() - 0.5) * 0.2,
      y: (Math.random() - 0.5) * 0.2,
      isPalm: true,
    });
  }
  for (let i = 0; i < N_POINTS / 2; i++) {
    pts.push({
      x: (Math.random() - 0.5) * 0.1,
      y: Math.abs(Math.random() * 0.05) + 0.15,
      isPalm: false,
    });
  }
  return pts;
}

function PointCloudCanvas({
  pattern,
  index,
}: {
  pattern: (typeof PATTERNS)[number];
  index: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const baseRef = useRef<{ x: number; y: number; isPalm: boolean }[] | null>(
    null
  );
  const animRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!baseRef.current) {
      baseRef.current = generateBaseHand();
    }
    const base = baseRef.current;

    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(0, 0, W, H);

    const t =
      ((frameRef.current % N_FRAMES) / N_FRAMES) * 2 * Math.PI;
    const angle = pattern.fn(t);

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Draw trajectory circle (faint)
    ctx.strokeStyle = "#d6d3d1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * 0.15, 0, Math.PI * 2);
    ctx.stroke();

    // Trajectory offset
    const tx = Math.cos(t) * W * 0.15;
    const ty = Math.sin(t) * W * 0.15;

    const scale = W * 1.6;
    const cx = W / 2 + tx;
    const cy = H / 2 + ty;

    for (const pt of base) {
      const rx = pt.x * cos - pt.y * sin;
      const ry = pt.x * sin + pt.y * cos;
      const sx = cx + rx * scale;
      const sy = cy - ry * scale;

      const size = pt.isPalm ? 2.5 : 3;
      ctx.fillStyle = pt.isPalm
        ? "rgba(120,113,108,0.6)"
        : pattern.color;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Angle indicator arc
    ctx.strokeStyle = pattern.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const arcR = 12;
    const startAngle = -Math.PI / 2;
    ctx.arc(W - 20, 20, arcR, startAngle, startAngle - angle, angle > 0);
    ctx.stroke();

    // Frame counter
    ctx.fillStyle = "#a8a29e";
    ctx.font = "10px monospace";
    ctx.fillText(
      `f${(frameRef.current % N_FRAMES).toString().padStart(2, "0")}`,
      6,
      H - 6
    );

    frameRef.current++;
    animRef.current = requestAnimationFrame(draw);
  }, [pattern]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      animRef.current = requestAnimationFrame(draw);
    }, index * 80);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(animRef.current);
    };
  }, [draw, index]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <canvas
        ref={canvasRef}
        width={180}
        height={180}
        className="rounded border border-[var(--card-border)]"
      />
      <div className="text-center">
        <div className="text-sm font-medium" style={{ color: pattern.color }}>
          {pattern.name}
        </div>
        <div className="font-mono text-xs text-[var(--muted)]">
          {pattern.desc}
        </div>
      </div>
    </div>
  );
}

export default function PointCloudViz() {
  return (
    <div className="canvas-grid">
      {PATTERNS.map((p, i) => (
        <PointCloudCanvas key={p.name} pattern={p} index={i} />
      ))}
    </div>
  );
}
