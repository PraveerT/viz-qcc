"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";

/* --------------------------------------------------------------------------
   Synthetic 3-point QCC playground.

   Three points A (red), B (green), C (blue) form a triangle over N frames.
     Rigid   X/Y/Z   rotate as a single rigid body about the chosen axis.
     Deform  X/Y/Z   add an independent random-walk translation per point on
                     top of the rigid rotation (breaks rigidity).

   Per-frame metrics shown live:
     - qf_aa'   forward quaternion rotating (a - centroid_t) to (a' - centroid_{t+1})
     - qb_a'a   its conjugate (backward)
     - same for points b and c
     - cycle angle from composing the per-triangle Kabsch step rotations over
       the full cycle  (0 deg for rigid, > 0 for deform)
   -------------------------------------------------------------------------- */

type V3 = [number, number, number];
type M3 = [number, number, number, number, number, number, number, number, number];
type Quat = [number, number, number, number];

const IDENTITY_Q: Quat = [1, 0, 0, 0];
const COLORS = ["#ef4444", "#22c55e", "#3b82f6"];
const POINT_LABELS = ["a", "b", "c"] as const;

const BASE_POINTS: V3[] = [
  [0.6, 0.0, 0.0],
  [-0.3, 0.52, 0.0],
  [-0.3, -0.52, 0.0],
];

type Axis = "x" | "y" | "z";
type Sample = {
  name: string;
  axis: Axis;
  deform: boolean;
  seed: number;
};

const SAMPLES: Sample[] = [
  { name: "Rigid X",  axis: "x", deform: false, seed: 0 },
  { name: "Rigid Y",  axis: "y", deform: false, seed: 0 },
  { name: "Rigid Z",  axis: "z", deform: false, seed: 0 },
  { name: "Deform X", axis: "x", deform: true,  seed: 11 },
  { name: "Deform Y", axis: "y", deform: true,  seed: 22 },
  { name: "Deform Z", axis: "z", deform: true,  seed: 33 },
];

/* -------- math -------- */

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function rotAxis(axis: Axis, p: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [x, y, z] = p;
  if (axis === "x") return [x, y * c - z * s, y * s + z * c];
  if (axis === "y") return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v: V3, s: number): V3 => [v[0] * s, v[1] * s, v[2] * s];
const ddot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dnorm = (v: V3) => Math.hypot(v[0], v[1], v[2]);
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v: V3, eps = 1e-9): V3 => {
  const n = dnorm(v);
  return n < eps ? [0, 0, 0] : scale(v, 1 / n);
};
const centroid = (pts: V3[]): V3 => {
  const n = pts.length;
  const c: V3 = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return [c[0] / n, c[1] / n, c[2] / n];
};

function frameFromPoints(p0: V3, p1: V3, p2: V3): M3 {
  const e1 = sub(p1, p0);
  const e2 = sub(p2, p0);
  const n1 = normalize(e1);
  const e2p = sub(e2, scale(n1, ddot(e2, n1)));
  const n2 = normalize(e2p);
  const n3 = cross(n1, n2);
  return [n1[0], n1[1], n1[2], n2[0], n2[1], n2[2], n3[0], n3[1], n3[2]];
}
function matMulT(A: M3, B: M3): M3 {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += A[i * 3 + k] * B[j * 3 + k];
      r[i * 3 + j] = s;
    }
  return r as M3;
}
function matToQuat(m: M3): Quat {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    return [0.25 / s, (m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [(m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s];
}
function quatNorm(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return n < 1e-9 ? [1, 0, 0, 0] : [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
function quatMul(a: Quat, b: Quat): Quat {
  const [w1, x1, y1, z1] = a;
  const [w2, x2, y2, z2] = b;
  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
  ];
}
function quatConj(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}
function quatAngleDeg(q: Quat): number {
  const w = Math.min(1, Math.max(-1, Math.abs(quatNorm(q)[0])));
  return (2 * Math.acos(w) * 180) / Math.PI;
}

/** Shortest-arc unit quaternion rotating v1 to v2. */
function quatFromVectors(v1: V3, v2: V3): Quat {
  const u1 = normalize(v1);
  const u2 = normalize(v2);
  const d = ddot(u1, u2);
  const w = 1 + d;
  if (w < 1e-6) {
    // antipodal: pick any perpendicular axis, rotate 180°
    const alt: V3 = Math.abs(u1[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const axis = normalize(cross(u1, alt));
    return quatNorm([0, axis[0], axis[1], axis[2]]);
  }
  const axis = cross(u1, u2);
  return quatNorm([w, axis[0], axis[1], axis[2]]);
}

/** Kabsch for 3 points. Returns rotation matrix (row-major) and mean residual. */
function kabsch(P: V3[], Q: V3[]): { R: M3; residual: number } {
  const cP = centroid(P);
  const cQ = centroid(Q);
  const Pc = P.map(p => sub(p, cP));
  const Qc = Q.map(q => sub(q, cQ));
  const R = matMulT(frameFromPoints(Q[0], Q[1], Q[2]), frameFromPoints(P[0], P[1], P[2]));
  let resid = 0;
  for (let i = 0; i < 3; i++) {
    const [px, py, pz] = Pc[i];
    const rx = R[0] * px + R[1] * py + R[2] * pz;
    const ry = R[3] * px + R[4] * py + R[5] * pz;
    const rz = R[6] * px + R[7] * py + R[8] * pz;
    const [qx, qy, qz] = Qc[i];
    resid += (rx - qx) ** 2 + (ry - qy) ** 2 + (rz - qz) ** 2;
  }
  return { R, residual: resid / 3 };
}

/* -------- data -------- */

function generateDeformTracks(sample: Sample, N: number, amp: number): V3[][] {
  if (!sample.deform) return [];
  const rng = mulberry32(sample.seed * 7919 + 1337);
  const tracks: V3[][] = [];
  for (let i = 0; i < 3; i++) {
    const track: V3[] = [];
    let cur: V3 = [0, 0, 0];
    for (let f = 0; f < N; f++) {
      const step = amp / 24;
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

function generateFrames(sample: Sample, N: number, totalRot: number, amp: number): V3[][] {
  const deform = generateDeformTracks(sample, N, amp);
  const frames: V3[][] = [];
  for (let f = 0; f < N; f++) {
    const a = (f / N) * totalRot;
    const pts: V3[] = BASE_POINTS.map((p, i) => {
      let q: V3 = rotAxis(sample.axis, p, a);
      if (sample.deform) q = add(q, deform[i][f]);
      return q;
    });
    frames.push(pts);
  }
  return frames;
}

type SampleStats = {
  cycleAngleDeg: number;
  meanResidual: number;
};

function computeSampleStats(frames: V3[][]): SampleStats {
  const N = frames.length;
  let resTotal = 0;
  let qComp: Quat = IDENTITY_Q;
  for (let t = 0; t < N; t++) {
    const tn = (t + 1) % N;
    const { R, residual } = kabsch(frames[t], frames[tn]);
    qComp = quatMul(qComp, quatNorm(matToQuat(R)));
    resTotal += residual;
  }
  return { cycleAngleDeg: quatAngleDeg(qComp), meanResidual: resTotal / N };
}

/** Per-point forward quaternions for frame-pair (t, t+1). Each is shortest-arc
 *  rotation from (p_i - centroid_t) to (p'_i - centroid_{t+1}). */
function perPointForwardQuats(P: V3[], Q: V3[]): Quat[] {
  const cP = centroid(P);
  const cQ = centroid(Q);
  return P.map((p, i) => quatFromVectors(sub(p, cP), sub(Q[i], cQ)));
}

/* -------- format helpers -------- */

const signed = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(2);
function fmtQuat(q: Quat): string {
  return `(${signed(q[0])}, ${signed(q[1])}, ${signed(q[2])}, ${signed(q[3])})`;
}

/* -------- components -------- */

function SampleCard({
  sample,
  frames,
  stats,
  frameIndex,
}: {
  sample: Sample;
  frames: V3[][];
  stats: SampleStats;
  frameIndex: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailsRef = useRef<Array<Array<[number, number]>>>([[], [], []]);
  const [size, setSize] = useState(300);

  // Responsive canvas size — track container width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(180, Math.floor(e.contentRect.width));
        setSize(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw on frame change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    if (canvas.width !== Math.floor(size * dpr)) {
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = size, H = size;

    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#e7e5e4";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 10); ctx.lineTo(W / 2, H - 10);
    ctx.moveTo(10, H / 2); ctx.lineTo(W - 10, H / 2);
    ctx.stroke();

    const f = frameIndex % frames.length;
    const sc = W * 0.22;
    const pts = frames[f];
    const proj = pts.map(p => ({
      x: W / 2 + p[0] * sc,
      y: H / 2 - p[1] * sc,
      z: p[2],
    }));

    if (f === 0) trailsRef.current = [[], [], []];
    proj.forEach((p, i) => {
      trailsRef.current[i].push([p.x, p.y]);
      if (trailsRef.current[i].length > frames.length) trailsRef.current[i].shift();
    });
    trailsRef.current.forEach((trail, i) => {
      if (trail.length < 2) return;
      ctx.strokeStyle = COLORS[i] + "40";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(trail[0][0], trail[0][1]);
      for (let k = 1; k < trail.length; k++) ctx.lineTo(trail[k][0], trail[k][1]);
      ctx.stroke();
    });

    ctx.strokeStyle = sample.deform ? "#d6d3d1" : "#525252";
    ctx.lineWidth = sample.deform ? 1 : 1.5;
    ctx.beginPath();
    ctx.moveTo(proj[0].x, proj[0].y);
    ctx.lineTo(proj[1].x, proj[1].y);
    ctx.lineTo(proj[2].x, proj[2].y);
    ctx.closePath();
    ctx.stroke();

    proj.forEach((p, i) => {
      const sz = Math.max(2.5, W * 0.018 + p.z * 2.2);
      ctx.fillStyle = COLORS[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
      ctx.fill();

      // label letter next to point
      ctx.fillStyle = COLORS[i];
      ctx.font = `${Math.max(10, W * 0.04)}px ui-sans-serif, system-ui`;
      ctx.fillText(POINT_LABELS[i], p.x + sz + 2, p.y - sz - 2);
    });

    ctx.fillStyle = "#a8a29e";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`f${f.toString().padStart(3, "0")}/${frames.length}`, 6, H - 6);
  }, [frames, frameIndex, sample.deform, size]);

  // Per-point quaternions for current step.
  const f = frameIndex % frames.length;
  const fn = (f + 1) % frames.length;
  const qf = useMemo(
    () => perPointForwardQuats(frames[f], frames[fn]),
    [frames, f, fn]
  );
  const qb = useMemo(() => qf.map(quatConj), [qf]);

  const angleStr = stats.cycleAngleDeg.toFixed(2);
  const resStr = stats.meanResidual.toExponential(1);
  const angleOk = stats.cycleAngleDeg < 1;

  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--card-border)] bg-[var(--card)] p-2.5">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">{sample.name}</div>
        <div
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
            angleOk ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
          }`}
        >
          cyc ∠ {angleStr}°
        </div>
      </div>
      <div ref={wrapRef} className="w-full">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: size + "px", display: "block" }}
          className="rounded border border-[var(--card-border)]"
        />
      </div>

      {/* Per-point quaternions, current step */}
      <div className="font-mono text-[10px] leading-[1.35] text-[var(--muted)]">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
          step f{f} → f{fn}
        </div>
        {POINT_LABELS.map((lab, i) => {
          const nxt = lab + "'";
          return (
            <div key={lab} className="grid grid-cols-[auto_1fr] gap-x-1">
              <div style={{ color: COLORS[i] }} className="font-semibold">
                qf_{lab}{nxt}
              </div>
              <div className="truncate">{fmtQuat(qf[i])}</div>
              <div style={{ color: COLORS[i] }} className="font-semibold">
                qb_{nxt}{lab}
              </div>
              <div className="truncate">{fmtQuat(qb[i])}</div>
            </div>
          );
        })}
      </div>

      <div className="font-mono text-[10px] text-[var(--muted)]">
        mean resid {resStr}
      </div>
    </div>
  );
}

/* -------- page -------- */

const N_OPTIONS = [16, 32, 64, 128] as const;
const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const;

export default function Home() {
  const [N, setN] = useState<(typeof N_OPTIONS)[number]>(64);
  const [totalRotTurns, setTotalRotTurns] = useState(1);
  const [deformAmp, setDeformAmp] = useState(0.35);
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [playing, setPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);

  const totalRotRad = totalRotTurns * 2 * Math.PI;

  const datasets = useMemo(() => {
    return SAMPLES.map(s => {
      const frames = generateFrames(s, N, totalRotRad, deformAmp);
      const stats = computeSampleStats(frames);
      return { sample: s, frames, stats };
    });
  }, [N, totalRotRad, deformAmp]);

  // Animation
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number | null>(null);
  const accumRef = useRef(0);
  const advance = useCallback((ts: number) => {
    if (lastTsRef.current == null) lastTsRef.current = ts;
    const dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;
    accumRef.current += dt * 12 * speed;
    while (accumRef.current >= 1) {
      accumRef.current -= 1;
      setFrameIndex(f => (f + 1) % N);
    }
    if (playing) rafRef.current = requestAnimationFrame(advance);
  }, [playing, speed, N]);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, advance]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-[var(--card-border)] bg-[var(--background)]/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-3 py-2 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate text-sm font-semibold sm:text-base">
              QCC synth: 3-point cycle consistency
            </h1>
            <button
              onClick={() => setPlaying(p => !p)}
              className="shrink-0 rounded border border-[var(--card-border)] px-3 py-1.5 text-xs hover:bg-[var(--card)]"
            >
              {playing ? "⏸ pause" : "▶ play"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-5">
        {/* Controls */}
        <section className="mb-4 grid grid-cols-1 gap-3 rounded border border-[var(--card-border)] bg-[var(--card)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-[11px] text-[var(--muted)]">Frames</label>
            <div className="mt-1 flex flex-wrap gap-1">
              {N_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setN(n)}
                  className={`rounded px-2 py-1 font-mono text-xs ${
                    n === N
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "border border-[var(--card-border)]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[var(--muted)]">
              Total rotation: <span className="font-mono">{totalRotTurns.toFixed(2)}×2π</span>
            </label>
            <input
              type="range" min={0} max={3} step={0.05}
              value={totalRotTurns}
              onChange={e => setTotalRotTurns(parseFloat(e.target.value))}
              className="mt-1 w-full accent-[var(--foreground)]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--muted)]">
              Deform amp: <span className="font-mono">{deformAmp.toFixed(2)}</span>
            </label>
            <input
              type="range" min={0} max={1} step={0.01}
              value={deformAmp}
              onChange={e => setDeformAmp(parseFloat(e.target.value))}
              className="mt-1 w-full accent-[var(--foreground)]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--muted)]">Speed</label>
            <div className="mt-1 flex flex-wrap gap-1">
              {SPEED_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`rounded px-2 py-1 font-mono text-xs ${
                    s === speed
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "border border-[var(--card-border)]"
                  }`}
                >
                  {s}×
                </button>
              ))}
              <button
                onClick={() => setFrameIndex(0)}
                className="rounded border border-[var(--card-border)] px-2 py-1 text-xs"
              >
                ⟲
              </button>
            </div>
          </div>
        </section>

        {/* Sample grid — mobile 1 col, tablet 2, desktop 3 */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Rigid</h2>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {datasets.slice(0, 3).map(d => (
              <SampleCard key={d.sample.name} sample={d.sample} frames={d.frames} stats={d.stats} frameIndex={frameIndex} />
            ))}
          </div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Deformed</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {datasets.slice(3).map(d => (
              <SampleCard key={d.sample.name} sample={d.sample} frames={d.frames} stats={d.stats} frameIndex={frameIndex} />
            ))}
          </div>
        </section>

        {/* Method note */}
        <section className="mt-6 rounded border border-[var(--card-border)] bg-[var(--card)] p-3 text-[11px] leading-relaxed text-[var(--muted)]">
          <div className="mb-1 font-semibold text-[var(--foreground)]">Method</div>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>
              Per point <span className="font-mono">i</span> and step{" "}
              <span className="font-mono">f → f+1</span>:{" "}
              <span className="font-mono">qf_ii&apos;</span> is the shortest-arc quaternion rotating{" "}
              <span className="font-mono">(pᵢ − centroid_t)</span> to{" "}
              <span className="font-mono">(pᵢ&apos; − centroid_{"{t+1}"})</span>.{" "}
              <span className="font-mono">qb_i&apos;i = qf_ii&apos;*</span> (conjugate).
            </li>
            <li>
              Cycle angle: compose per-step Kabsch rotations R<sub>t</sub> = F<sub>t+1</sub>·F<sub>t</sub><sup>T</sup> across the full cycle, take angle from identity. Rigid = 0°, deform &gt; 0°.
            </li>
            <li>
              Mean residual: how non-rigid each step is (Procrustes leftover).
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
