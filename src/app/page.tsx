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

/** Rotate a 3D vector by a unit quaternion. */
function quatRotate(q: Quat, v: V3): V3 {
  const [w, x, y, z] = q;
  const c1x = y * v[2] - z * v[1];
  const c1y = z * v[0] - x * v[2];
  const c1z = x * v[1] - y * v[0];
  const c2x = y * c1z - z * c1y;
  const c2y = z * c1x - x * c1z;
  const c2z = x * c1y - y * c1x;
  return [
    v[0] + 2 * (w * c1x + c2x),
    v[1] + 2 * (w * c1y + c2y),
    v[2] + 2 * (w * c1z + c2z),
  ];
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

/** Horn's quaternion Kabsch. Works for any N ≥ 3.
 *  Returns unit quaternion rotating centered P onto centered Q. */
function kabschQuat(P: V3[], Q: V3[]): Quat {
  const cP = centroid(P);
  const cQ = centroid(Q);
  // Cross-covariance S (3x3)
  const S = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let k = 0; k < P.length; k++) {
    const px = P[k][0] - cP[0], py = P[k][1] - cP[1], pz = P[k][2] - cP[2];
    const qx = Q[k][0] - cQ[0], qy = Q[k][1] - cQ[1], qz = Q[k][2] - cQ[2];
    S[0][0] += px * qx; S[0][1] += px * qy; S[0][2] += px * qz;
    S[1][0] += py * qx; S[1][1] += py * qy; S[1][2] += py * qz;
    S[2][0] += pz * qx; S[2][1] += pz * qy; S[2][2] += pz * qz;
  }
  const Sxx = S[0][0], Sxy = S[0][1], Sxz = S[0][2];
  const Syx = S[1][0], Syy = S[1][1], Syz = S[1][2];
  const Szx = S[2][0], Szy = S[2][1], Szz = S[2][2];
  const N: number[][] = [
    [Sxx + Syy + Szz, Syz - Szy,         Szx - Sxz,         Sxy - Syx],
    [Syz - Szy,       Sxx - Syy - Szz,   Sxy + Syx,         Szx + Sxz],
    [Szx - Sxz,       Sxy + Syx,        -Sxx + Syy - Szz,   Syz + Szy],
    [Sxy - Syx,       Szx + Sxz,         Syz + Szy,        -Sxx - Syy + Szz],
  ];
  // Power iteration for dominant eigenvector of a 4x4 symmetric matrix.
  // Use a shifted matrix to prefer the positive-eigenvalue side.
  const SHIFT = Math.max(Math.abs(Sxx), Math.abs(Syy), Math.abs(Szz)) * 4 + 1;
  let v = [1, 0.01, 0.01, 0.01];
  for (let iter = 0; iter < 60; iter++) {
    const u = [
      (N[0][0] + SHIFT) * v[0] + N[0][1] * v[1] + N[0][2] * v[2] + N[0][3] * v[3],
      N[1][0] * v[0] + (N[1][1] + SHIFT) * v[1] + N[1][2] * v[2] + N[1][3] * v[3],
      N[2][0] * v[0] + N[2][1] * v[1] + (N[2][2] + SHIFT) * v[2] + N[2][3] * v[3],
      N[3][0] * v[0] + N[3][1] * v[1] + N[3][2] * v[2] + (N[3][3] + SHIFT) * v[3],
    ];
    const n = Math.hypot(u[0], u[1], u[2], u[3]);
    if (n < 1e-12) break;
    v = [u[0] / n, u[1] / n, u[2] / n, u[3] / n];
  }
  // v is [w, x, y, z]
  return quatNorm([v[0], v[1], v[2], v[3]]);
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

function QuatAxisLegend() {
  return (
    <span className="flex items-center gap-1 text-[9px] normal-case tracking-normal">
      <span style={{ color: "#ef4444" }}>x</span>
      <span style={{ color: "#22c55e" }}>y</span>
      <span style={{ color: "#3b82f6" }}>z</span>
    </span>
  );
}

/** Grouped line-chart: X axis = quat labels, three lines (x, y, z) tracking
 *  the component values across the 5 quaternions for one point.
 *  One chart per point (a/b/c) in a card. */
function QuatLineChart({
  pointLabel,
  accent,
  labels,
  quats,
  max = 0.35,
}: {
  pointLabel: string;
  accent: string;
  labels: string[];
  quats: Quat[];
  max?: number;
}) {
  const W = 220;
  const H = 110;
  const PAD_L = 28;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = quats.length;
  const xAt = (i: number) => PAD_L + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const yAt = (v: number) => PAD_T + innerH / 2 - (Math.max(-max, Math.min(max, v)) / max) * (innerH / 2);

  const series = [
    { key: "x", color: "#ef4444", vals: quats.map(q => q[1]) },
    { key: "y", color: "#22c55e", vals: quats.map(q => q[2]) },
    { key: "z", color: "#3b82f6", vals: quats.map(q => q[3]) },
  ];

  // Y-axis ticks at -max, -max/2, 0, +max/2, +max
  const ticks = [-max, -max / 2, 0, max / 2, max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full">
      {/* Title */}
      <text x={PAD_L} y={11} fontSize={9} fill={accent} fontWeight={600}>
        point {pointLabel}
      </text>

      {/* Y grid + labels */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            y1={yAt(t)}
            x2={W - PAD_R}
            y2={yAt(t)}
            stroke={t === 0 ? "#d6d3d1" : "#f0efed"}
            strokeWidth={t === 0 ? 0.6 : 0.4}
          />
          <text x={PAD_L - 3} y={yAt(t) + 3} fontSize={8} fill="#a8a29e" textAnchor="end">
            {t === 0 ? "0" : t.toFixed(2)}
          </text>
        </g>
      ))}

      {/* X axis labels */}
      {labels.map((lab, i) => (
        <text
          key={i}
          x={xAt(i)}
          y={H - 6}
          fontSize={7.5}
          fill="#78716c"
          textAnchor="middle"
        >
          {lab}
        </text>
      ))}

      {/* Data lines + dots */}
      {series.map(s => {
        const d = s.vals
          .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
          .join(" ");
        return (
          <g key={s.key}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={1.3} />
            {s.vals.map((v, i) => (
              <circle key={i} cx={xAt(i)} cy={yAt(v)} r={2} fill={s.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** One quaternion row: label + horizontal xyz bars on first line, full numeric
 *  values on the second line so nothing gets truncated. */
function QuatRow({ tag, q, accent }: { tag: string; q: Quat; accent: string }) {
  const BAR_MAX = 0.35;
  const axes = [
    { v: q[1], color: "#ef4444" }, // x — red
    { v: q[2], color: "#22c55e" }, // y — green
    { v: q[3], color: "#3b82f6" }, // z — blue
  ];
  return (
    <div className="py-[2px] text-[11px]">
      <div className="grid grid-cols-[90px_1fr] items-center gap-1.5">
        <div style={{ color: accent }} className="truncate font-semibold">{tag}</div>
        <svg viewBox="-100 -12 200 24" preserveAspectRatio="none" className="h-[18px] w-full">
          <line x1={-100} y1={0} x2={100} y2={0} stroke="#e7e5e4" strokeWidth={0.4} />
          <line x1={0} y1={-12} x2={0} y2={12} stroke="#d6d3d1" strokeWidth={0.6} />
          {axes.map((a, i) => {
            const w = Math.max(-100, Math.min(100, (a.v / BAR_MAX) * 100));
            const y = -9 + i * 6;
            return (
              <rect key={i} x={Math.min(0, w)} y={y} width={Math.abs(w)} height={4}
                fill={a.color} opacity={0.9} />
            );
          })}
        </svg>
      </div>
      <div className="ml-[90px] font-mono text-[10.5px] text-[var(--muted)] whitespace-nowrap overflow-x-auto">
        {fmtQuat(q)}
      </div>
    </div>
  );
}

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

  // Per-point quaternions for current step (f -> fn) and the next step (fn -> fnn).
  const f = frameIndex % frames.length;
  const fn = (f + 1) % frames.length;
  const fnn = (f + 2) % frames.length;
  const qfA = useMemo(                                             // a  -> a'
    () => perPointForwardQuats(frames[f], frames[fn]),
    [frames, f, fn]
  );
  const qfB = useMemo(                                             // a' -> a''
    () => perPointForwardQuats(frames[fn], frames[fnn]),
    [frames, fn, fnn]
  );
  const qfDirect = useMemo(                                        // a  -> a''  direct
    () => perPointForwardQuats(frames[f], frames[fnn]),
    [frames, f, fnn]
  );
  // Composed: apply qfA then qfB.  In our convention q_total = qfB * qfA so
  // that q_total acts on (a - c_t) to yield (a'' - c_{t+2}) via qB( qA( v ) ).
  const qfComposed = useMemo(
    () => qfA.map((qa, i) => quatNorm(quatMul(qfB[i], qa))),
    [qfA, qfB]
  );
  // Transitivity error: angle between direct quat and the composed one.
  const transErrDeg = useMemo(
    () =>
      qfDirect.map((qd, i) => {
        // q_err = qfComposed * conj(qd)  -> angle from identity
        const err = quatMul(qfComposed[i], quatConj(qd));
        return quatAngleDeg(err);
      }),
    [qfDirect, qfComposed]
  );
  const qb = useMemo(() => qfA.map(quatConj), [qfA]);              // qb_a'a

  // Global best-fit rotation (Kabsch over all 3 points) for step f -> fn.
  const qBestStep = useMemo(() => kabschQuat(frames[f], frames[fn]), [frames, f, fn]);

  // Per-point rigidity residuals: a' - (q_best · (a - c) + c')
  const rigidity = useMemo(() => {
    const cP = centroid(frames[f]);
    const cQ = centroid(frames[fn]);
    return frames[f].map((p, i) => {
      const pred = add(quatRotate(qBestStep, sub(p, cP)), cQ);
      return sub(frames[fn][i], pred);
    });
  }, [frames, f, fn, qBestStep]);

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

      {/* Per-point quaternions — numbers + bar graph of xyz */}
      <div className="font-mono text-[10px] leading-[1.35] text-[var(--muted)]">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide">
          <span>steps f{f}→f{fn}→f{fnn}</span>
          <QuatAxisLegend />
        </div>
        {POINT_LABELS.map((lab, i) => {
          const p1 = lab + "'";
          const p2 = lab + "''";
          const err = transErrDeg[i];
          const errOk = err < 1;
          const idA: Quat = quatNorm(quatMul(qfA[i], qb[i]));                        // q × q^* = id
          const idB: Quat = quatNorm(quatMul(qfB[i], quatConj(qfB[i])));             // same for step B
          const qbDirect: Quat = quatConj(qfDirect[i]);
          const idD: Quat = quatNorm(quatMul(qfDirect[i], qbDirect));
          const qBestQa: Quat = quatNorm(quatMul(qBestStep, qfA[i]));                 // q_best × qf_aa'
          const rows: { tag: string; q: Quat }[] = [
            { tag: `qf_${lab}${p1}`,             q: qfA[i] },
            { tag: `qb_${p1}${lab}`,             q: qb[i] },
            { tag: `qf${lab}${p1}·qb${p1}${lab}`, q: idA },
            { tag: `qf_${p1}${p2}`,              q: qfB[i] },
            { tag: `qb_${p2}${p1}`,              q: quatConj(qfB[i]) },
            { tag: `qf${p1}${p2}·qb${p2}${p1}`,  q: idB },
            { tag: `qf_${lab}${p2}`,             q: qfDirect[i] },
            { tag: `qb_${p2}${lab}`,             q: qbDirect },
            { tag: `qf${lab}${p2}·qb${p2}${lab}`, q: idD },
            { tag: `qfB∘qfA`,                    q: qfComposed[i] },
            { tag: `q_best(→')`,                 q: qBestStep },
            { tag: `q_best·qf_${lab}${p1}`,      q: qBestQa },
          ];
          const chartLabels = [
            `qf_${lab}${p1}`,
            `qb_${p1}${lab}`,
            `qf${lab}${p1}·qb`,
            `qf_${p1}${p2}`,
            `qb_${p2}${p1}`,
            `qf${p1}${p2}·qb`,
            `qf_${lab}${p2}`,
            `qb_${p2}${lab}`,
            `qf${lab}${p2}·qb`,
            `qfB∘qfA`,
            `q_best`,
            `q_best·qf`,
          ];
          const chartQuats = [
            qfA[i], qb[i], idA,
            qfB[i], quatConj(qfB[i]), idB,
            qfDirect[i], qbDirect, idD,
            qfComposed[i],
            qBestStep, qBestQa,
          ];
          return (
            <div key={lab} className="mb-1 rounded border border-[var(--card-border)] px-1 py-0.5">
              {rows.map(r => (
                <QuatRow key={r.tag} tag={r.tag} q={r.q} accent={COLORS[i]} />
              ))}
              <div className="mt-1">
                <QuatLineChart
                  pointLabel={lab}
                  accent={COLORS[i]}
                  labels={chartLabels}
                  quats={chartQuats}
                />
              </div>
              <div className={`mt-0.5 font-mono text-[10px] ${errOk ? "text-emerald-600" : "text-red-600"}`}>
                trans ∠ {err.toFixed(2)}°
              </div>
            </div>
          );
        })}
      </div>

      {/* Rigidity residuals vs global q_best */}
      <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-2">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-[var(--muted)]">
          <span>rigidity residuals</span>
          <QuatAxisLegend />
        </div>
        <div className="mb-1">
          <QuatRow tag="q_best(all)" q={qBestStep} accent="#78716c" />
        </div>
        <div className="space-y-0.5">
          {POINT_LABELS.map((lab, i) => (
            <RigidityRow
              key={lab}
              label={`‖res_${lab}‖`}
              accent={COLORS[i]}
              residual={rigidity[i]}
              max={0.15}
            />
          ))}
        </div>
        <div className="mt-1 text-[9.5px] text-[var(--muted)]">
          residual<sub>i</sub> = p<sub>i</sub>&apos; − (q_best·(p<sub>i</sub>−c) + c&apos;); rigid ⇒ ‖·‖ ≈ 0
        </div>
      </div>

      <div className="font-mono text-[10px] text-[var(--muted)]">
        mean resid {resStr}
      </div>
    </div>
  );
}

/* -------- small-angle demo -------- */

function quatFromAxisAngleDeg(axis: V3, deg: number): Quat {
  const a = (deg * Math.PI) / 180;
  const h = a / 2;
  const s = Math.sin(h);
  const n = normalize(axis);
  return [Math.cos(h), n[0] * s, n[1] * s, n[2] * s];
}

function quatRotateVec(q: Quat, v: V3): V3 {
  return quatRotate(q, v);
}

function SmallAngleDemo() {
  // Two rotations: q_a around X, q_b around Y. Compare compose vs vector-add.
  const [angA, setAngA] = useState(10);
  const [angB, setAngB] = useState(10);

  const qA = useMemo(() => quatFromAxisAngleDeg([1, 0, 0], angA), [angA]);
  const qB = useMemo(() => quatFromAxisAngleDeg([0, 1, 0], angB), [angB]);
  const qCompose = useMemo(() => quatNorm(quatMul(qB, qA)), [qA, qB]);
  // Vector-add approximation: sum vector parts, w = 1, normalize.
  const qAdd = useMemo(
    () => quatNorm([1, qA[1] + qB[1], qA[2] + qB[2], qA[3] + qB[3]]),
    [qA, qB]
  );
  const errDeg = useMemo(() => {
    const err = quatMul(qCompose, quatConj(qAdd));
    return quatAngleDeg(err);
  }, [qCompose, qAdd]);

  // Visualize: rotate ref vector (0, 0, 1) by both, project to 2D (XY plane).
  const refVec: V3 = [0, 0, 1];
  const vCompose = useMemo(() => quatRotateVec(qCompose, refVec), [qCompose]);
  const vAdd = useMemo(() => quatRotateVec(qAdd, refVec), [qAdd]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(300);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setCw(Math.max(180, Math.floor(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const size = cw;
    if (canvas.width !== Math.floor(size * dpr)) {
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = size, H = size;
    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(0, 0, W, H);

    // Draw unit-sphere equator (circle) for reference
    ctx.strokeStyle = "#e7e5e4";
    ctx.lineWidth = 1;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.38;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // Axes
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();

    // Ref vector start (at (0,0)+size marker)
    const proj = (v: V3) => ({
      x: cx + v[0] * R,
      y: cy - v[1] * R,
      z: v[2],
    });

    const pStart = proj(refVec);
    const pC = proj(vCompose);
    const pA = proj(vAdd);

    // Arrows from start to endpoints (xy projection)
    const arrow = (to: { x: number; y: number; z: number }, color: string) => {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      // head
      ctx.beginPath();
      ctx.arc(to.x, to.y, Math.max(3, 1.5 + Math.abs(to.z) * 3), 0, Math.PI * 2);
      ctx.fill();
    };

    // Draw start point
    ctx.fillStyle = "#78716c";
    ctx.beginPath();
    ctx.arc(pStart.x, pStart.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#78716c";
    ctx.font = `${Math.max(10, W * 0.035)}px ui-sans-serif, system-ui`;
    ctx.fillText("start (0,0,1)", pStart.x + 6, pStart.y - 6);

    arrow(pC, "#2563eb"); // compose — blue
    arrow(pA, "#f97316"); // add — orange

    ctx.fillStyle = "#2563eb";
    ctx.fillText("compose (q_b·q_a)", 10, 18);
    ctx.fillStyle = "#f97316";
    ctx.fillText("add (vec sum)", 10, 34);
  }, [cw, vCompose, vAdd]);

  const okSmall = errDeg < 1;

  return (
    <section className="mt-6 rounded border border-[var(--card-border)] bg-[var(--card)] p-3">
      <div className="mb-2 text-sm font-semibold">Small-angle: add vs multiply</div>
      <p className="mb-3 text-[11px] text-[var(--muted)]">
        q<sub>a</sub> = rotation around <span className="font-mono">x</span> by θ<sub>a</sub>,
        q<sub>b</sub> = around <span className="font-mono">y</span> by θ<sub>b</sub>.
        Compare true composition q<sub>b</sub>·q<sub>a</sub> with vector-add
        (1, x<sub>a</sub>+x<sub>b</sub>, y<sub>a</sub>+y<sub>b</sub>, z<sub>a</sub>+z<sub>b</sub>) then normalized.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-[var(--muted)]">
              θ<sub>a</sub> (around x): <span className="font-mono">{angA.toFixed(0)}°</span>
            </label>
            <input
              type="range" min={0} max={180} step={1}
              value={angA}
              onChange={e => setAngA(parseFloat(e.target.value))}
              className="mt-1 w-full accent-[var(--foreground)]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--muted)]">
              θ<sub>b</sub> (around y): <span className="font-mono">{angB.toFixed(0)}°</span>
            </label>
            <input
              type="range" min={0} max={180} step={1}
              value={angB}
              onChange={e => setAngB(parseFloat(e.target.value))}
              className="mt-1 w-full accent-[var(--foreground)]"
            />
          </div>
          <div className="font-mono text-[11px] leading-[1.5] text-[var(--muted)]">
            <div>q<sub>a</sub>  = {fmtQuat(qA)}</div>
            <div>q<sub>b</sub>  = {fmtQuat(qB)}</div>
            <div className="text-[#2563eb]">compose = {fmtQuat(qCompose)}</div>
            <div className="text-[#f97316]">add     = {fmtQuat(qAdd)}</div>
          </div>
          <div
            className={`inline-block rounded px-2 py-1 font-mono text-xs ${
              okSmall ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
            }`}
          >
            Δ angle between compose &amp; add: {errDeg.toFixed(2)}°
          </div>
          <div className="text-[11px] leading-relaxed text-[var(--muted)]">
            When both θ are small (≲10°), Δ ≈ 0. As θ grows, the error grows
            quadratically. Above ~45° the two diverge visibly.
          </div>
        </div>
        <div ref={wrapRef} className="w-full">
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: cw + "px", display: "block" }}
            className="rounded border border-[var(--card-border)]"
          />
          <div className="mt-1 text-[10px] text-[var(--muted)]">
            Endpoints of rotating (0, 0, 1) by compose (blue) vs add (orange).
            Projected to the XY plane.
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------- real (Hungarian) sample card -------- */

type RealClass = { classId: number; frames: number[][][] };        // frames[T][P][3]
type RealData = { P: number; T: number; classes: RealClass[] };

function aggregateQuats(P: V3[], Q: V3[]): {
  perPoint: Quat[];
  mean: Quat;
} {
  const cP = centroid(P);
  const cQ = centroid(Q);
  const qs = P.map((p, i) => quatFromVectors(sub(p, cP), sub(Q[i], cQ)));
  // "Mean quaternion" via chordal mean then renormalize (OK when spread small).
  const acc: Quat = [0, 0, 0, 0];
  for (const q of qs) {
    // Fix sign to the first quat's hemisphere to avoid antipodal cancellation.
    const sign = qs[0][0] * q[0] + qs[0][1] * q[1] + qs[0][2] * q[2] + qs[0][3] * q[3] >= 0 ? 1 : -1;
    acc[0] += sign * q[0]; acc[1] += sign * q[1]; acc[2] += sign * q[2]; acc[3] += sign * q[3];
  }
  const m = quatNorm([acc[0] / qs.length, acc[1] / qs.length, acc[2] / qs.length, acc[3] / qs.length]);
  return { perPoint: qs, mean: m };
}

function statsBand(values: number[]): { mean: number; lo: number; hi: number } {
  if (!values.length) return { mean: 0, lo: 0, hi: 0 };
  let s = 0;
  for (const v of values) s += v;
  const mean = s / values.length;
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  const std = Math.sqrt(sq / values.length);
  return { mean, lo: mean - std, hi: mean + std };
}

/** Line chart overlaying mean±std bands for x/y/z components across all P points. */
function QuatBandChart({
  labels,
  quatsPerPoint,
  max = 0.35,
}: {
  labels: string[];
  quatsPerPoint: Quat[][];   // [quatIdx][pointIdx] -> Quat
  max?: number;
}) {
  const W = 300;
  const H = 130;
  const PAD_L = 28;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = labels.length;
  const xAt = (i: number) => PAD_L + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const yAt = (v: number) =>
    PAD_T + innerH / 2 - (Math.max(-max, Math.min(max, v)) / max) * (innerH / 2);

  const series = [
    { key: "x", color: "#ef4444", idx: 1 },
    { key: "y", color: "#22c55e", idx: 2 },
    { key: "z", color: "#3b82f6", idx: 3 },
  ];

  // For each quaternion position, gather component values across points.
  const bands = series.map(s => {
    return quatsPerPoint.map(qs => statsBand(qs.map(q => q[s.idx])));
  });

  const ticks = [-max, -max / 2, 0, max / 2, max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PAD_L} y1={yAt(t)} x2={W - PAD_R} y2={yAt(t)}
            stroke={t === 0 ? "#d6d3d1" : "#f0efed"}
            strokeWidth={t === 0 ? 0.6 : 0.4} />
          <text x={PAD_L - 3} y={yAt(t) + 3} fontSize={8} fill="#a8a29e" textAnchor="end">
            {t === 0 ? "0" : t.toFixed(2)}
          </text>
        </g>
      ))}
      {labels.map((lab, i) => (
        <text key={i} x={xAt(i)} y={H - 6} fontSize={7.5} fill="#78716c" textAnchor="middle">{lab}</text>
      ))}
      {series.map((s, si) => {
        // Band polygon: hi values forward, lo values reverse.
        const hi = bands[si].map((b, i) => `${xAt(i).toFixed(1)},${yAt(b.hi).toFixed(1)}`);
        const lo = bands[si].slice().reverse().map((b, i) => {
          const idx = bands[si].length - 1 - i;
          return `${xAt(idx).toFixed(1)},${yAt(b.lo).toFixed(1)}`;
        });
        const poly = hi.concat(lo).join(" ");
        const meanPath = bands[si]
          .map((b, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(b.mean).toFixed(1)}`)
          .join(" ");
        return (
          <g key={s.key}>
            <polygon points={poly} fill={s.color} opacity={0.12} />
            <path d={meanPath} fill="none" stroke={s.color} strokeWidth={1.3} />
            {bands[si].map((b, i) => (
              <circle key={i} cx={xAt(i)} cy={yAt(b.mean)} r={1.5} fill={s.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Compact residual row: label + xyz bars of residual vector + scalar magnitude. */
function RigidityRow({
  label,
  accent,
  residual,
  max = 0.15,
}: {
  label: string;
  accent: string;
  residual: V3;
  max?: number;
}) {
  const mag = Math.hypot(residual[0], residual[1], residual[2]);
  const ok = mag < max * 0.5;
  const axes = [
    { v: residual[0], color: "#ef4444" },
    { v: residual[1], color: "#22c55e" },
    { v: residual[2], color: "#3b82f6" },
  ];
  return (
    <div className="py-[2px] text-[11px]">
      <div className="grid grid-cols-[90px_1fr_64px] items-center gap-1.5">
        <div style={{ color: accent }} className="truncate font-semibold">{label}</div>
        <svg viewBox="-100 -12 200 24" preserveAspectRatio="none" className="h-[18px] w-full">
          <line x1={-100} y1={0} x2={100} y2={0} stroke="#e7e5e4" strokeWidth={0.4} />
          <line x1={0} y1={-12} x2={0} y2={12} stroke="#d6d3d1" strokeWidth={0.6} />
          {axes.map((a, i) => {
            const w = Math.max(-100, Math.min(100, (a.v / max) * 100));
            const y = -9 + i * 6;
            return (
              <rect key={i} x={Math.min(0, w)} y={y} width={Math.abs(w)} height={4}
                fill={a.color} opacity={0.9} />
            );
          })}
        </svg>
        <div
          className={`rounded px-1 py-0.5 text-right font-mono text-[10px] ${
            ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
          }`}
        >
          {mag.toFixed(3)}
        </div>
      </div>
    </div>
  );
}

/** Row per point, shows summary; click to expand full 5-quat detail. */
function RealPointRow({
  label,
  accent,
  transDeg,
  quats,
  labels,
}: {
  label: string;
  accent: string;
  transDeg: number;
  quats: Quat[];        // 5 entries
  labels: string[];     // 5 entries
}) {
  const [open, setOpen] = useState(false);
  const errOk = transDeg < 2;
  return (
    <div className="rounded border border-[var(--card-border)]">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-1.5 py-0.5 text-left hover:bg-[var(--card)]"
      >
        <div style={{ color: accent }} className="w-12 font-mono text-[10px] font-semibold">
          {label}
        </div>
        <div
          className={`rounded px-1 py-0.5 font-mono text-[10px] ${
            errOk ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
          }`}
        >
          ∠{transDeg.toFixed(2)}°
        </div>
        {/* Mini per-quat xyz bars inline (n = quats.length) */}
        <svg viewBox="0 0 200 14" preserveAspectRatio="none" className="h-3 flex-1">
          {quats.map((q, i) => {
            const n = quats.length;
            const x = (i / n) * 200;
            const cw = 200 / n - 1;
            const mid = x + cw / 2;
            const bh = 4;
            const scale = (v: number) => Math.max(-1, Math.min(1, v / 0.35));
            return (
              <g key={i}>
                <line x1={x} y1={7} x2={x + cw} y2={7} stroke="#f0efed" strokeWidth={0.4} />
                <line x1={mid} y1={1} x2={mid} y2={13} stroke="#e7e5e4" strokeWidth={0.4} />
                {[q[1], q[2], q[3]].map((val, j) => {
                  const colors = ["#ef4444", "#22c55e", "#3b82f6"];
                  const w = scale(val) * (cw / 2);
                  const yy = 2 + j * bh;
                  return (
                    <rect key={j}
                      x={w >= 0 ? mid : mid + w}
                      y={yy}
                      width={Math.max(0.5, Math.abs(w))}
                      height={bh - 1}
                      fill={colors[j]}
                      opacity={0.85}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        <span className="text-[10px] text-[var(--muted)]">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--card-border)] px-1 py-1">
          {quats.map((q, i) => (
            <QuatRow key={labels[i]} tag={labels[i]} q={q} accent={accent} />
          ))}
        </div>
      )}
    </div>
  );
}

function RealSampleCard({
  classId,
  frames,
  frameIndex,
}: {
  classId: number;
  frames: V3[][];
  frameIndex: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(300);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setSize(Math.max(180, Math.floor(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw current frame.
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
    const sc = W * 0.32;
    const pts = frames[f];

    // Light fading trail: overlay previous frame positions faint
    const trailFrames = 6;
    for (let k = 1; k <= trailFrames; k++) {
      const tf = frames[(f - k + frames.length) % frames.length];
      const alpha = ((trailFrames - k + 1) / trailFrames) * 0.15;
      ctx.fillStyle = `rgba(120, 113, 108, ${alpha})`;
      for (const p of tf) {
        ctx.beginPath();
        ctx.arc(W / 2 + p[0] * sc, H / 2 - p[1] * sc, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < pts.length; i++) {
      const [x, y, z] = pts[i];
      const px = W / 2 + x * sc;
      const py = H / 2 - y * sc;
      const sz = Math.max(1.5, 2 + z * 2);
      // Per-point color by angle around origin (hue cue).
      const hue = ((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * 360;
      ctx.fillStyle = `hsl(${hue.toFixed(0)}, 65%, 55%)`;
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#a8a29e";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`f${f.toString().padStart(2, "0")}/${frames.length}`, 6, H - 6);
  }, [frames, frameIndex, size]);

  // Current triplet frames (f, fn, fnn) per-point quat tables.
  const T = frames.length;
  const f = frameIndex % T;
  const fn = (f + 1) % T;
  const fnn = (f + 2) % T;

  const { perPoint: qfA, mean: qfAmean } = useMemo(
    () => aggregateQuats(frames[f], frames[fn]),
    [frames, f, fn]
  );
  const { perPoint: qfB, mean: qfBmean } = useMemo(
    () => aggregateQuats(frames[fn], frames[fnn]),
    [frames, fn, fnn]
  );
  const { perPoint: qfDirect, mean: qfDmean } = useMemo(
    () => aggregateQuats(frames[f], frames[fnn]),
    [frames, f, fnn]
  );
  const qb = useMemo(() => qfA.map(quatConj), [qfA]);
  const qbMean = useMemo(() => quatConj(qfAmean), [qfAmean]);
  const qfComposed = useMemo(
    () => qfA.map((qa, i) => quatNorm(quatMul(qfB[i], qa))),
    [qfA, qfB]
  );
  const qfComposedMean = useMemo(() => quatNorm(quatMul(qfBmean, qfAmean)), [qfAmean, qfBmean]);
  const transDeg = useMemo(
    () =>
      qfDirect.map((qd, i) => {
        const err = quatMul(qfComposed[i], quatConj(qd));
        return quatAngleDeg(err);
      }),
    [qfDirect, qfComposed]
  );
  const transStats = useMemo(() => statsBand(transDeg), [transDeg]);

  // Identity-check products: qf · qb = (1,0,0,0) by construction.
  const idA = useMemo(() => qfA.map((q, i) => quatNorm(quatMul(q, qb[i]))), [qfA, qb]);
  const qbB = useMemo(() => qfB.map(quatConj), [qfB]);
  const idB = useMemo(() => qfB.map((q, i) => quatNorm(quatMul(q, qbB[i]))), [qfB, qbB]);
  const qbDirect = useMemo(() => qfDirect.map(quatConj), [qfDirect]);
  const idD = useMemo(
    () => qfDirect.map((q, i) => quatNorm(quatMul(q, qbDirect[i]))),
    [qfDirect, qbDirect]
  );
  // Global best-fit rotation over all P points (Kabsch f -> fn), and per-point compose.
  const qBestStep = useMemo(() => kabschQuat(frames[f], frames[fn]), [frames, f, fn]);
  const qBestQa = useMemo(
    () => qfA.map(q => quatNorm(quatMul(qBestStep, q))),
    [qBestStep, qfA]
  );
  const qBestBroadcast: Quat[] = useMemo(() => qfA.map(() => qBestStep), [qfA, qBestStep]);

  // Per-point rigidity residuals against global q_best.
  const rigidity = useMemo(() => {
    const cP = centroid(frames[f]);
    const cQ = centroid(frames[fn]);
    return frames[f].map((p, i) => {
      const pred = add(quatRotate(qBestStep, sub(p, cP)), cQ);
      return sub(frames[fn][i], pred);
    });
  }, [frames, f, fn, qBestStep]);
  const rigidityMags = useMemo(() => rigidity.map(r => Math.hypot(r[0], r[1], r[2])), [rigidity]);
  const rigidityStats = useMemo(() => statsBand(rigidityMags), [rigidityMags]);

  const labels = [
    "qf_aa'", "qb_a'a", "qfaa'·qba'a",
    "qf_a'a''", "qb_a''a'", "qfa'a''·qba''a'",
    "qf_aa''", "qb_a''a", "qfaa''·qba''a",
    "qfB∘qfA",
    "q_best(→')", "q_best·qfaa'",
  ];
  const quatsPerPoint: Quat[][] = [
    qfA, qb, idA,
    qfB, qbB, idB,
    qfDirect, qbDirect, idD,
    qfComposed,
    qBestBroadcast, qBestQa,
  ];
  const meanId: Quat = [1, 0, 0, 0];
  const meanQuats: Quat[] = [
    qfAmean, qbMean, meanId,
    qfBmean, quatConj(qfBmean), meanId,
    qfDmean, quatConj(qfDmean), meanId,
    qfComposedMean,
    qBestStep, quatNorm(quatMul(qBestStep, qfAmean)),
  ];

  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--card-border)] bg-[var(--card)] p-2.5">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">class {String(classId + 1).padStart(2, "0")}</div>
        <div
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
            transStats.mean < 2 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
          }`}
        >
          trans μ {transStats.mean.toFixed(2)}° ±{(transStats.hi - transStats.mean).toFixed(2)}
        </div>
      </div>
      <div ref={wrapRef} className="w-full">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: size + "px", display: "block" }}
          className="rounded border border-[var(--card-border)]"
        />
      </div>

      <div className="font-mono text-[10px] leading-[1.35] text-[var(--muted)]">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide">
          <span>P={quatsPerPoint[0].length} · steps f{f}→f{fn}→f{fnn}</span>
          <QuatAxisLegend />
        </div>

        {/* Mean quaternion bar-rows */}
        <div className="mb-2">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide">mean over all points</div>
          {labels.map((lab, i) => (
            <QuatRow key={lab} tag={lab} q={meanQuats[i]} accent="#78716c" />
          ))}
        </div>

        <div className="mb-2">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide">distribution (mean ± std)</div>
          <QuatBandChart labels={labels} quatsPerPoint={quatsPerPoint} />
        </div>

        <div>
          <div className="mb-0.5 flex items-center gap-2 text-[10px]">
            <span className="font-semibold uppercase tracking-wide">per-point quaternions</span>
            <span className="text-[10px]">(click row to expand)</span>
          </div>
          <div className="max-h-[320px] space-y-0.5 overflow-y-auto pr-1">
            {qfA.map((_, idx) => {
              const pointQuats = [
                qfA[idx], qb[idx], idA[idx],
                qfB[idx], qbB[idx], idB[idx],
                qfDirect[idx], qbDirect[idx], idD[idx],
                qfComposed[idx],
                qBestStep, qBestQa[idx],
              ];
              return (
                <RealPointRow
                  key={idx}
                  label={`p${idx + 1}`}
                  accent={idx % 2 === 0 ? "#1f2937" : "#0f172a"}
                  transDeg={transDeg[idx]}
                  quats={pointQuats}
                  labels={labels}
                />
              );
            })}
          </div>
        </div>

        {/* Rigidity residuals */}
        <div className="mt-3 rounded border border-[var(--card-border)] bg-[var(--card)] p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <span>
              rigidity residuals · μ {rigidityStats.mean.toFixed(3)} ±{(rigidityStats.hi - rigidityStats.mean).toFixed(3)}
            </span>
            <QuatAxisLegend />
          </div>
          <div className="mb-1">
            <QuatRow tag="q_best(all)" q={qBestStep} accent="#78716c" />
          </div>
          <div className="max-h-[320px] space-y-0.5 overflow-y-auto pr-1">
            {rigidity.map((r, idx) => (
              <RigidityRow
                key={idx}
                label={`‖res_p${idx + 1}‖`}
                accent={idx % 2 === 0 ? "#1f2937" : "#0f172a"}
                residual={r}
                max={0.15}
              />
            ))}
          </div>
          <div className="mt-1 text-[9.5px] text-[var(--muted)]">
            residual<sub>i</sub> = p<sub>i</sub>&apos; − (q_best·(p<sub>i</sub>−c) + c&apos;); rigid ⇒ ‖·‖ ≈ 0
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------- page -------- */

type View = "synth" | "real";

const N_OPTIONS = [16, 32, 64, 128] as const;
const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const;

export default function Home() {
  const [view, setView] = useState<View>("synth");
  const [N, setN] = useState<(typeof N_OPTIONS)[number]>(64);
  const [totalRotTurns, setTotalRotTurns] = useState(1);
  const [deformAmp, setDeformAmp] = useState(0.35);
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [playing, setPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);

  // Real-data JSON, fetched on demand.
  const [realData, setRealData] = useState<RealData | null>(null);
  const [realError, setRealError] = useState<string | null>(null);
  useEffect(() => {
    if (view !== "real" || realData) return;
    fetch("/hungarian_samples.json")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: RealData) => {
        setRealData(data);
        setRealError(null);
      })
      .catch(err => setRealError(String(err)));
  }, [view, realData]);

  const totalRotRad = totalRotTurns * 2 * Math.PI;

  const datasets = useMemo(() => {
    return SAMPLES.map(s => {
      const frames = generateFrames(s, N, totalRotRad, deformAmp);
      const stats = computeSampleStats(frames);
      return { sample: s, frames, stats };
    });
  }, [N, totalRotRad, deformAmp]);

  // Active T for the animation clock depends on the view.
  const activeT = view === "real" ? (realData?.T ?? 32) : N;

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
      setFrameIndex(f => (f + 1) % activeT);
    }
    if (playing) rafRef.current = requestAnimationFrame(advance);
  }, [playing, speed, activeT]);

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
              QCC viz: quaternion cycle consistency
            </h1>
            <button
              onClick={() => setPlaying(p => !p)}
              className="shrink-0 rounded border border-[var(--card-border)] px-3 py-1.5 text-xs hover:bg-[var(--card)]"
            >
              {playing ? "⏸ pause" : "▶ play"}
            </button>
          </div>
          {/* View tabs */}
          <div className="mt-1 flex gap-1">
            {(["synth", "real"] as View[]).map(v => (
              <button
                key={v}
                onClick={() => { setView(v); setFrameIndex(0); }}
                className={`rounded px-3 py-1 text-xs ${
                  v === view
                    ? "bg-[var(--foreground)] text-[var(--background)]"
                    : "border border-[var(--card-border)] hover:bg-[var(--card)]"
                }`}
              >
                {v === "synth" ? "Synthetic 3-pt" : "Real (Hungarian)"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-5">
        {view === "real" ? (
          <RealView realData={realData} realError={realError} frameIndex={frameIndex} />
        ) : (
          <SynthView
            N={N} setN={setN}
            totalRotTurns={totalRotTurns} setTotalRotTurns={setTotalRotTurns}
            deformAmp={deformAmp} setDeformAmp={setDeformAmp}
            speed={speed} setSpeed={setSpeed}
            setFrameIndex={setFrameIndex}
            datasets={datasets}
            frameIndex={frameIndex}
          />
        )}
      </main>
    </div>
  );
}

function RealView({
  realData,
  realError,
  frameIndex,
}: {
  realData: RealData | null;
  realError: string | null;
  frameIndex: number;
}) {
  const [selectedClass, setSelectedClass] = useState(0);
  if (realError) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
        Failed to load hungarian_samples.json: {realError}
      </div>
    );
  }
  if (!realData) {
    return (
      <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
        Loading real Hungarian samples…
      </div>
    );
  }
  const classes = realData.classes;
  const cur = classes[selectedClass];
  return (
    <section>
      <div className="mb-3 flex items-center gap-3 text-xs text-[var(--muted)]">
        <span>{classes.length} classes · P={realData.P} · T={realData.T}</span>
        <span>one test sample per class, Hungarian correspondence-aligned</span>
      </div>
      {/* Class pill selector */}
      <div className="mb-3 -mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <div className="flex gap-1">
          {classes.map((c, i) => (
            <button
              key={c.classId}
              onClick={() => setSelectedClass(i)}
              className={`shrink-0 rounded px-2 py-1 font-mono text-[11px] ${
                i === selectedClass
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "border border-[var(--card-border)] hover:bg-[var(--card)]"
              }`}
            >
              c{String(c.classId + 1).padStart(2, "0")}
            </button>
          ))}
        </div>
      </div>
      <RealSampleCard classId={cur.classId} frames={cur.frames as V3[][]} frameIndex={frameIndex} />
    </section>
  );
}

type SynthViewProps = {
  N: (typeof N_OPTIONS)[number];
  setN: (n: (typeof N_OPTIONS)[number]) => void;
  totalRotTurns: number;
  setTotalRotTurns: (n: number) => void;
  deformAmp: number;
  setDeformAmp: (n: number) => void;
  speed: (typeof SPEED_OPTIONS)[number];
  setSpeed: (n: (typeof SPEED_OPTIONS)[number]) => void;
  setFrameIndex: (f: number) => void;
  datasets: { sample: Sample; frames: V3[][]; stats: SampleStats }[];
  frameIndex: number;
};

function SynthView({
  N, setN, totalRotTurns, setTotalRotTurns, deformAmp, setDeformAmp,
  speed, setSpeed, setFrameIndex, datasets, frameIndex,
}: SynthViewProps) {
  return (
    <>
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

        {/* Small-angle add-vs-multiply demo */}
        <SmallAngleDemo />

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
              Two-frame transitivity: compare direct{" "}
              <span className="font-mono">qf_ii&apos;&apos;</span> (a → a&apos;&apos;) with the composed{" "}
              <span className="font-mono">qf_i&apos;i&apos;&apos; ∘ qf_ii&apos;</span> (a → a&apos; → a&apos;&apos;). Angle between them = transitivity error.
              For rigid rotation = 0°; for deform &gt; 0°.
            </li>
            <li>
              Cycle angle: compose per-step Kabsch rotations R<sub>t</sub> = F<sub>t+1</sub>·F<sub>t</sub><sup>T</sup> across the full cycle, take angle from identity. Rigid = 0°, deform &gt; 0°.
            </li>
            <li>
              Mean residual: how non-rigid each step is (Procrustes leftover).
            </li>
          </ul>
        </section>
    </>
  );
}
