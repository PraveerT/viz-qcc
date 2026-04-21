"use client";

import { useEffect, useRef, useCallback } from "react";

type V3 = [number, number, number];

// Three base points forming a triangle in the XY plane.
const BASE_POINTS: V3[] = [
  [0.6, 0.0, 0.0],
  [-0.3, 0.52, 0.0],
  [-0.3, -0.52, 0.0],
];
const COLORS = ["#ef4444", "#22c55e", "#3b82f6"];

const N_FRAMES = 128;
const DEFORM_AMPLITUDE = 0.35;

type Axis = "x" | "y" | "z";

function rot(axis: Axis, p: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [x, y, z] = p;
  if (axis === "x") return [x, y * c - z * s, y * s + z * c];
  if (axis === "y") return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate deterministic per-point random-walk trajectory. Each point has its
// own independent walk; total drift magnitude grows with sqrt(frames).
function generateDeformTracks(seedBase: number): V3[][] {
  const rng = mulberry32(seedBase * 7919 + 1337);
  const tracks: V3[][] = [];
  for (let i = 0; i < 3; i++) {
    const track: V3[] = [];
    let cur: V3 = [0, 0, 0];
    for (let f = 0; f < N_FRAMES; f++) {
      const step = DEFORM_AMPLITUDE / 24;
      cur = [
        cur[0] + (rng() - 0.5) * step,
        cur[1] + (rng() - 0.5) * step,
        cur[2] + (rng() - 0.5) * step,
      ];
      track.push(cur);
    }
    tracks.push(track);
  }
  return tracks;
}

type Sample = {
  name: string;
  desc: string;
  axis: Axis;
  deform: boolean;
  seed: number;
};

const SAMPLES: Sample[] = [
  { name: "Rigid X", desc: "rotate about x-axis", axis: "x", deform: false, seed: 0 },
  { name: "Rigid Y", desc: "rotate about y-axis", axis: "y", deform: false, seed: 0 },
  { name: "Rigid Z", desc: "rotate about z-axis", axis: "z", deform: false, seed: 0 },
  { name: "Deform X", desc: "rot x + per-point walk", axis: "x", deform: true, seed: 11 },
  { name: "Deform Y", desc: "rot y + per-point walk", axis: "y", deform: true, seed: 22 },
  { name: "Deform Z", desc: "rot z + per-point walk", axis: "z", deform: true, seed: 33 },
];

function SampleCanvas({ sample, index }: { sample: Sample; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const animRef = useRef<number>(0);
  const deformRef = useRef<V3[][] | null>(null);
  const trailsRef = useRef<Array<Array<[number, number]>>>([[], [], []]);

  if (sample.deform && !deformRef.current) {
    deformRef.current = generateDeformTracks(sample.seed);
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(0, 0, W, H);

    // Axis cross reference
    ctx.strokeStyle = "#e7e5e4";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 10);
    ctx.lineTo(W / 2, H - 10);
    ctx.moveTo(10, H / 2);
    ctx.lineTo(W - 10, H / 2);
    ctx.stroke();

    const f = frameRef.current % N_FRAMES;
    const angle = (f / N_FRAMES) * 2 * Math.PI;
    const scale = W * 0.22;

    const pts: V3[] = BASE_POINTS.map((p, i) => {
      let q: V3 = rot(sample.axis, p, angle);
      if (sample.deform && deformRef.current) {
        const d = deformRef.current[i][f];
        q = [q[0] + d[0], q[1] + d[1], q[2] + d[2]];
      }
      return q;
    });

    // Orthographic project (xy plane). Depth (z) modulates size + brightness.
    const proj = pts.map((p) => ({
      x: W / 2 + p[0] * scale,
      y: H / 2 - p[1] * scale,
      z: p[2],
    }));

    // Append to trails.
    proj.forEach((p, i) => {
      trailsRef.current[i].push([p.x, p.y]);
      if (trailsRef.current[i].length > N_FRAMES) {
        trailsRef.current[i].shift();
      }
    });

    // Draw trails (fading).
    trailsRef.current.forEach((trail, i) => {
      if (trail.length < 2) return;
      ctx.strokeStyle = COLORS[i] + "50";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(trail[0][0], trail[0][1]);
      for (let k = 1; k < trail.length; k++) {
        ctx.lineTo(trail[k][0], trail[k][1]);
      }
      ctx.stroke();
    });

    // Draw triangle edges connecting current points (to show rigid vs deformed shape).
    ctx.strokeStyle = sample.deform ? "#d6d3d1" : "#78716c";
    ctx.lineWidth = sample.deform ? 1 : 1.5;
    ctx.beginPath();
    ctx.moveTo(proj[0].x, proj[0].y);
    ctx.lineTo(proj[1].x, proj[1].y);
    ctx.lineTo(proj[2].x, proj[2].y);
    ctx.closePath();
    ctx.stroke();

    // Draw current points, size scaled by z-depth (perspective cue).
    proj.forEach((p, i) => {
      const size = Math.max(2.0, 4.5 + p.z * 2.5);
      ctx.fillStyle = COLORS[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Frame counter.
    ctx.fillStyle = "#a8a29e";
    ctx.font = "10px monospace";
    ctx.fillText(`f${f.toString().padStart(2, "0")}`, 6, H - 6);

    frameRef.current++;
    animRef.current = requestAnimationFrame(draw);
  }, [sample]);

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
        width={200}
        height={200}
        className="rounded border border-[var(--card-border)]"
      />
      <div className="text-center">
        <div className="text-sm font-medium">{sample.name}</div>
        <div className="font-mono text-xs text-[var(--muted)]">
          {sample.desc}
        </div>
      </div>
    </div>
  );
}

export default function SyntheticRotationViz() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--muted)]">
          Rigid (3 points rotate as a triangle)
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SAMPLES.slice(0, 3).map((s, i) => (
            <SampleCanvas key={s.name} sample={s} index={i} />
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--muted)]">
          Rigid + per-point random translation (deformed)
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SAMPLES.slice(3).map((s, i) => (
            <SampleCanvas key={s.name} sample={s} index={i + 3} />
          ))}
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Each canvas shows 3 colored points observed over {N_FRAMES} frames.
        Faint trails show recent trajectory. Rigid samples preserve the
        triangle shape; deform samples add an independent random walk per
        point so the triangle is no longer rigid.
      </p>
    </div>
  );
}
