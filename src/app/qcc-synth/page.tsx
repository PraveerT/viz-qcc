"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";

/* --------------------------------------------------------------------------
   Synthetic 3-point QCC playground.

   Six samples:
     Rigid   X/Y/Z   — triangle rotates about axis over N frames
     Deform  X/Y/Z   — same rotation plus independent random-walk per point

   For each sample we compute:
     - Per-step Kabsch rotation R_t mapping 3 points at t to t+1
     - Compose q_0 * q_1 * ... * q_{T-1}  (cyclic)
     - QCC angle = angle(q_composed, identity) in degrees
     - Per-step Procrustes residual (how non-rigid each step is)

   Controls: total rotation per cycle, deform amplitude, frame count, play speed.
   -------------------------------------------------------------------------- */

type V3 = [number, number, number];
type M3 = [number, number, number, number, number, number, number, number, number]; // row-major 3x3
type Quat = [number, number, number, number]; // [w, x, y, z]

const IDENTITY_Q: Quat = [1, 0, 0, 0];

const BASE_POINTS: V3[] = [
  [0.6, 0.0, 0.0],
  [-0.3, 0.52, 0.0],
  [-0.3, -0.52, 0.0],
];
const COLORS = ["#ef4444", "#22c55e", "#3b82f6"];

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

/* -------- math helpers -------- */

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

function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a: V3, b: V3): V3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function norm(v: V3): number { return Math.hypot(v[0], v[1], v[2]); }
function scale(v: V3, s: number): V3 { return [v[0] * s, v[1] * s, v[2] * s]; }
function dot(a: V3, b: V3): number { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function cross(a: V3, b: V3): V3 {
  return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
}
function normalize(v: V3, eps = 1e-9): V3 {
  const n = norm(v);
  return n < eps ? [0, 0, 0] : scale(v, 1 / n);
}

/** Orthonormal frame from 3 points (rows of returned matrix are the three axes). */
function frameFromPoints(p0: V3, p1: V3, p2: V3): M3 {
  const e1 = sub(p1, p0);
  const e2 = sub(p2, p0);
  const n1 = normalize(e1);
  const e2p = sub(e2, scale(n1, dot(e2, n1)));
  const n2 = normalize(e2p);
  const n3 = cross(n1, n2);
  // row-major: row 0 = n1, row 1 = n2, row 2 = n3
  return [
    n1[0], n1[1], n1[2],
    n2[0], n2[1], n2[2],
    n3[0], n3[1], n3[2],
  ];
}

/** A * B^T for two row-major 3x3 matrices. */
function matMulT(A: M3, B: M3): M3 {
  const r: number[] = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) {
        s += A[i * 3 + k] * B[j * 3 + k]; // row i of A dot row j of B (= column j of B^T)
      }
      r[i * 3 + j] = s;
    }
  }
  return r as M3;
}

/** Row-major 3x3 rotation matrix to quaternion [w, x, y, z]. */
function matToQuat(m: M3): Quat {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
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
  return n < 1e-9 ? [1, 0, 0, 0] : [q[0]/n, q[1]/n, q[2]/n, q[3]/n];
}
function quatMul(a: Quat, b: Quat): Quat {
  const [w1, x1, y1, z1] = a;
  const [w2, x2, y2, z2] = b;
  return [
    w1*w2 - x1*x2 - y1*y2 - z1*z2,
    w1*x2 + x1*w2 + y1*z2 - z1*y2,
    w1*y2 - x1*z2 + y1*w2 + z1*x2,
    w1*z2 + x1*y2 - y1*x2 + z1*w2,
  ];
}
function quatAngleDeg(q: Quat): number {
  const w = Math.min(1, Math.max(-1, Math.abs(quatNorm(q)[0])));
  return (2 * Math.acos(w) * 180) / Math.PI;
}

/** Best-fit rigid rotation from P -> Q (each is 3 points, V3[3]) via Kabsch on
 *  centered coordinates. Returns { R (row-major 3x3), residual }. */
function kabsch(P: V3[], Q: V3[]): { R: M3; residual: number } {
  // Centroids
  const cP: V3 = [0, 0, 0];
  const cQ: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    cP[0] += P[i][0]; cP[1] += P[i][1]; cP[2] += P[i][2];
    cQ[0] += Q[i][0]; cQ[1] += Q[i][1]; cQ[2] += Q[i][2];
  }
  cP[0] /= 3; cP[1] /= 3; cP[2] /= 3;
  cQ[0] /= 3; cQ[1] /= 3; cQ[2] /= 3;

  const Pc: V3[] = P.map(p => sub(p, cP));
  const Qc: V3[] = Q.map(q => sub(q, cQ));

  // For 3 points we can avoid SVD by using the frame-basis trick:
  const Fp = frameFromPoints(P[0], P[1], P[2]);
  const Fq = frameFromPoints(Q[0], Q[1], Q[2]);
  // R such that R @ F_p^T = F_q^T, i.e., R = F_q^T F_p  (acting on column vectors)
  // With rows = axes, row-major conversion:  R_row = F_q^T * F_p ... we just need
  //   R @ v_p = v_q   where v_p uses F_p as basis. matMulT gives A * B^T.
  // We want R = F_q_cols * F_p_rows = (F_q^T)_rows -> that's transpose of F_q as row-major.
  //
  // Simpler: both F arrays have ROWS = basis axes. As a 3x3 "change of basis"
  // matrix whose columns are axes, the inverse maps world->basis = rows as a
  // row-major matrix. So:  R_world = F_q_cols * F_p_rows = (F_q as rows)^T * (F_p as rows)
  //                                = (matMulT of F_q_rows and F_p_rows is F_q * F_p^T
  //                                  which is already R as row-major).
  const R = matMulT(Fq, Fp);

  // Residual: sum over i of |R * Pc[i] - Qc[i]|^2 / 3
  let resid = 0;
  for (let i = 0; i < 3; i++) {
    const [px, py, pz] = Pc[i];
    const rx = R[0]*px + R[1]*py + R[2]*pz;
    const ry = R[3]*px + R[4]*py + R[5]*pz;
    const rz = R[6]*px + R[7]*py + R[8]*pz;
    const [qx, qy, qz] = Qc[i];
    resid += (rx - qx) ** 2 + (ry - qy) ** 2 + (rz - qz) ** 2;
  }
  return { R, residual: resid / 3 };
}

/* -------- data gen -------- */

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

/* -------- QCC calc -------- */

type SampleStats = {
  cycleAngleDeg: number;
  meanResidual: number;
  perStepAngleDeg: number[];
  perStepResidual: number[];
};

function computeQCC(frames: V3[][]): SampleStats {
  const N = frames.length;
  const perStepAngle: number[] = [];
  const perStepRes: number[] = [];
  let qComp: Quat = IDENTITY_Q;
  for (let t = 0; t < N; t++) {
    const tn = (t + 1) % N;
    const { R, residual } = kabsch(frames[t], frames[tn]);
    const q = quatNorm(matToQuat(R));
    qComp = quatMul(qComp, q);
    perStepAngle.push(quatAngleDeg(q));
    perStepRes.push(residual);
  }
  const cycleAngleDeg = quatAngleDeg(qComp);
  const meanResidual = perStepRes.reduce((a, b) => a + b, 0) / N;
  return { cycleAngleDeg, meanResidual, perStepAngleDeg: perStepAngle, perStepResidual: perStepRes };
}

/* -------- canvas render -------- */

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailsRef = useRef<Array<Array<[number, number]>>>([[], [], []]);

  // Redraw on frameIndex or frames change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(0, 0, W, H);

    // Axes
    ctx.strokeStyle = "#e7e5e4";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 10);
    ctx.lineTo(W / 2, H - 10);
    ctx.moveTo(10, H / 2);
    ctx.lineTo(W - 10, H / 2);
    ctx.stroke();

    const f = frameIndex % frames.length;
    const scale = W * 0.22;
    const pts = frames[f];
    const proj = pts.map(p => ({
      x: W / 2 + p[0] * scale,
      y: H / 2 - p[1] * scale,
      z: p[2],
    }));

    // Append trail; reset if we looped.
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

    // Triangle edges
    ctx.strokeStyle = sample.deform ? "#d6d3d1" : "#525252";
    ctx.lineWidth = sample.deform ? 1 : 1.5;
    ctx.beginPath();
    ctx.moveTo(proj[0].x, proj[0].y);
    ctx.lineTo(proj[1].x, proj[1].y);
    ctx.lineTo(proj[2].x, proj[2].y);
    ctx.closePath();
    ctx.stroke();

    proj.forEach((p, i) => {
      const size = Math.max(2.2, 5 + p.z * 2.2);
      ctx.fillStyle = COLORS[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#a8a29e";
    ctx.font = "11px monospace";
    ctx.fillText(`f${f.toString().padStart(3, "0")}/${frames.length}`, 6, H - 6);
  }, [frames, frameIndex, sample.deform]);

  const angleStr = stats.cycleAngleDeg.toFixed(2);
  const resStr = stats.meanResidual.toExponential(2);
  const angleOk = stats.cycleAngleDeg < 1;

  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--card-border)] bg-[var(--card)] p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">{sample.name}</div>
        <div
          className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
            angleOk ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
          }`}
        >
          QCC {angleStr}°
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={260}
        height={260}
        className="rounded border border-[var(--card-border)]"
      />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono text-[var(--muted)]">
        <dt>cycle ∠</dt>
        <dd className="text-right">{angleStr}°</dd>
        <dt>mean resid</dt>
        <dd className="text-right">{resStr}</dd>
        <dt>steps</dt>
        <dd className="text-right">{stats.perStepAngleDeg.length}</dd>
      </dl>
    </div>
  );
}

/* -------- page -------- */

const N_OPTIONS = [16, 32, 64, 128] as const;
const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const;

export default function QccSynth() {
  const [N, setN] = useState<(typeof N_OPTIONS)[number]>(64);
  const [totalRotTurns, setTotalRotTurns] = useState(1);     // in units of 2pi
  const [deformAmp, setDeformAmp] = useState(0.35);
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [playing, setPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);

  const totalRotRad = totalRotTurns * 2 * Math.PI;

  // Generate frames + QCC stats for each sample (memoized against params).
  const datasets = useMemo(() => {
    return SAMPLES.map(s => {
      const frames = generateFrames(s, N, totalRotRad, deformAmp);
      const stats = computeQCC(frames);
      return { sample: s, frames, stats };
    });
  }, [N, totalRotRad, deformAmp]);

  // Animation clock
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number | null>(null);
  const accumRef = useRef(0);
  const advance = useCallback((ts: number) => {
    if (!playing) {
      lastTsRef.current = null;
      return;
    }
    if (lastTsRef.current == null) lastTsRef.current = ts;
    const dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;
    accumRef.current += dt * 12 * speed; // 12 fps base
    while (accumRef.current >= 1) {
      accumRef.current -= 1;
      setFrameIndex(f => (f + 1) % N);
    }
    rafRef.current = requestAnimationFrame(advance);
  }, [playing, speed, N]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(rafRef.current);
  }, [advance]);

  // Pause loop when 'playing' flips
  useEffect(() => {
    if (!playing) cancelAnimationFrame(rafRef.current);
    else rafRef.current = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, advance]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <nav className="sticky top-0 z-50 w-full border-b border-[var(--card-border)] bg-[var(--background)]">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2 text-xs">
          <a href="/" className="text-[var(--muted)] hover:text-[var(--foreground)]">← Back</a>
          <div className="font-semibold">QCC Synthetic 3-point playground</div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Controls */}
        <section className="mb-6 grid grid-cols-2 gap-4 rounded border border-[var(--card-border)] bg-[var(--card)] p-4 md:grid-cols-4">
          <div>
            <label className="text-xs text-[var(--muted)]">Frames per cycle</label>
            <div className="mt-1 flex gap-1">
              {N_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setN(n)}
                  className={`rounded px-2 py-1 text-xs font-mono ${
                    n === N
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "border border-[var(--card-border)] hover:bg-[var(--card)]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">
              Total rotation (turns): <span className="font-mono">{totalRotTurns.toFixed(2)}×2π</span>
            </label>
            <input
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={totalRotTurns}
              onChange={e => setTotalRotTurns(parseFloat(e.target.value))}
              className="mt-1 w-full"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">
              Deform amplitude: <span className="font-mono">{deformAmp.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={deformAmp}
              onChange={e => setDeformAmp(parseFloat(e.target.value))}
              className="mt-1 w-full"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Playback</label>
            <div className="mt-1 flex gap-1">
              <button
                onClick={() => setPlaying(p => !p)}
                className="rounded border border-[var(--card-border)] px-2 py-1 text-xs hover:bg-[var(--card)]"
              >
                {playing ? "⏸ Pause" : "▶ Play"}
              </button>
              {SPEED_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`rounded px-2 py-1 text-xs font-mono ${
                    s === speed
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "border border-[var(--card-border)] hover:bg-[var(--card)]"
                  }`}
                >
                  {s}×
                </button>
              ))}
              <button
                onClick={() => setFrameIndex(0)}
                className="rounded border border-[var(--card-border)] px-2 py-1 text-xs hover:bg-[var(--card)]"
              >
                ⟲
              </button>
            </div>
          </div>
        </section>

        {/* Legend */}
        <section className="mb-4 flex items-center gap-6 text-xs text-[var(--muted)]">
          <div>
            Cycle ∠ = <span className="font-mono">angle(q₀·q₁·…·q_{N-1}, identity)</span>;
            for rigid rotations = 0°, for deformed &gt; 0°.
          </div>
        </section>

        {/* Cards */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Rigid</h2>
          <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            {datasets.slice(0, 3).map(d => (
              <SampleCard key={d.sample.name} sample={d.sample} frames={d.frames} stats={d.stats} frameIndex={frameIndex} />
            ))}
          </div>
          <h2 className="mb-2 text-sm font-semibold">Rigid + per-point random translation (deformed)</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {datasets.slice(3).map(d => (
              <SampleCard key={d.sample.name} sample={d.sample} frames={d.frames} stats={d.stats} frameIndex={frameIndex} />
            ))}
          </div>
        </section>

        <section className="mt-8 rounded border border-[var(--card-border)] bg-[var(--card)] p-4 text-xs text-[var(--muted)]">
          <div className="mb-1 font-semibold text-[var(--foreground)]">Method</div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Build orthonormal frame F<sub>t</sub> per frame from the 3 points (Gram-Schmidt on edges).</li>
            <li>Per-step rotation R<sub>t</sub> = F<sub>t+1</sub> · F<sub>t</sub><sup>T</sup>; convert to unit quaternion q<sub>t</sub>.</li>
            <li>Compose cyclically: q<sub>composed</sub> = q<sub>0</sub>·q<sub>1</sub>·…·q<sub>N−1</sub> (closes the loop since frame N ≡ frame 0 mod N).</li>
            <li>QCC angle = 2·arccos|w(q<sub>composed</sub>)|, reported in degrees. 0° means perfect cycle closure.</li>
            <li>Mean residual = ‖R<sub>t</sub>·(P<sub>t</sub>−c)−(P<sub>t+1</sub>−c)‖²/3 averaged over t; near 0 for rigid motion, larger when per-step motion is not a pure rotation.</li>
          </ol>
        </section>
      </main>
    </div>
  );
}
