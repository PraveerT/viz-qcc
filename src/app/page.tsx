"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";

type Top3 = [number, number][];
type Sample = {
  idx: number;
  rel_path: string;
  true_class: number;
  pred_class: number;
  correct: boolean;
  top3: Top3;
  pts_q1000: number[][][];
  depth_png_b64: string;
};
type Payload = {
  target_class: number;
  compare_class: number;
  class_names: string[];
  frames: number;
  points: number;
  depth_w: number;
  depth_h: number;
  samples_c3: Sample[];
  samples_c16: Sample[];
};

const MAX_POINTS = 512;

function drawArrow2D(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  color: string, alpha: number,
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) { ctx.globalAlpha = 1; return; }
  const ux = dx / len, uy = dy / len;
  const ah = Math.min(4, len * 0.5);
  const px = -uy, py = ux;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * ah + px * ah * 0.5, y1 - uy * ah + py * ah * 0.5);
  ctx.lineTo(x1 - ux * ah - px * ah * 0.5, y1 - uy * ah - py * ah * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function halton(i: number, base: number): number {
  let f = 1, r = 0, n = i;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

function convexHull2D(xs: number[], ys: number[]): [number, number][] {
  const pts: [number, number][] = xs.map((x, i) => [x, ys[i]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (O: [number, number], A: [number, number], B: [number, number]) =>
    (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

function project(
  px: number, py: number, pz: number,
  yaw: number, pitch: number,
  cw: number, ch: number,
  zoom: number = 1,
  panX: number = 0, panY: number = 0,
): [number, number, number] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const x = px * cy + pz * sy;
  let y = py;
  let z = -px * sy + pz * cy;
  const y2 = y * cx - z * sx;
  const z2 = y * sx + z * cx;
  y = y2; z = z2;
  const focal = 2.6;
  const camZ = 3.5;
  const denom = camZ - z;
  const sx2 = (x * focal) / denom;
  const sy2 = (y * focal) / denom;
  const half = Math.min(cw, ch) * 0.5 * zoom;
  return [cw * 0.5 + panX + sx2 * half, ch * 0.5 + panY - sy2 * half, denom];
}

export default function Page() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(8);
  const [numPoints, setNumPoints] = useState(128);
  const [yaw, setYaw] = useState(0.5);
  const [pitch, setPitch] = useState(-0.25);
  const [showGlyph, setShowGlyph] = useState(true);
  const [glyphScale, setGlyphScale] = useState(0.08);
  const [velScale, setVelScale] = useState(2.0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [showBox, setShowBox] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showVolume, setShowVolume] = useState(false);
  const [voxelRes, setVoxelRes] = useState(12);
  const [showLattice, setShowLattice] = useState(false);
  const [latticeCount, setLatticeCount] = useState(512);
  const [panelOpen, setPanelOpen] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const panning = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const touchState = useRef<{
    mode: "rotate" | "pinch";
    x: number; y: number;
    yaw: number; pitch: number;
    panX: number; panY: number;
    dist: number; zoom: number;
  } | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const onResize = () => forceTick(t => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    fetch("/class3_viz.json")
      .then(r => r.json())
      .then(setData)
      .catch(e => setError(String(e)));
  }, []);

  const sample = useMemo(() => data?.samples_c3[sampleIdx] ?? null, [data, sampleIdx]);
  const T = data?.frames ?? 0;
  const dataPoints = data?.points ?? 0;

  // bounding box over all frames, all points
  const bbox = useMemo(() => {
    if (!sample) return null;
    let xmin = Infinity, ymin = Infinity, zmin = Infinity;
    let xmax = -Infinity, ymax = -Infinity, zmax = -Infinity;
    for (const f of sample.pts_q1000) {
      for (const [x, y, z] of f) {
        if (x < xmin) xmin = x; if (x > xmax) xmax = x;
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
        if (z < zmin) zmin = z; if (z > zmax) zmax = z;
      }
    }
    return {
      xmin: xmin / 1000, ymin: ymin / 1000, zmin: zmin / 1000,
      xmax: xmax / 1000, ymax: ymax / 1000, zmax: zmax / 1000,
    };
  }, [sample]);

  // canonical lattice: 512 Halton(2,3,5) samples in canonical cube [-1,1]^3.
  // index #i is fixed forever; per-frame world position warps via that
  // frame's bbox so the lattice tracks the volume while preserving
  // correspondence.
  const canonicalLattice = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 1; i <= 512; i++) {
      pts.push([
        2 * halton(i, 2) - 1,
        2 * halton(i, 3) - 1,
        2 * halton(i, 5) - 1,
      ]);
    }
    return pts;
  }, []);

  // per-frame bbox of raw points → coarse warp target
  const perFrameBboxes = useMemo(() => {
    if (!sample) return null;
    const bbs: { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number }[] = [];
    for (const fpts of sample.pts_q1000) {
      let xmin = Infinity, ymin = Infinity, zmin = Infinity;
      let xmax = -Infinity, ymax = -Infinity, zmax = -Infinity;
      for (const [x, y, z] of fpts) {
        if (x < xmin) xmin = x; if (x > xmax) xmax = x;
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
        if (z < zmin) zmin = z; if (z > zmax) zmax = z;
      }
      bbs.push({
        cx: (xmin + xmax) / 2000,
        cy: (ymin + ymax) / 2000,
        cz: (zmin + zmax) / 2000,
        hx: (xmax - xmin) / 2000,
        hy: (ymax - ymin) / 2000,
        hz: (zmax - zmin) / 2000,
      });
    }
    return bbs;
  }, [sample]);

  // per-frame occupancy grid (16³, anchored to static bbox) — list of
  // occupied-voxel centers. Used to snap lattice points into the actual
  // occupied volume, gas-fill style.
  const perFrameOcc = useMemo(() => {
    if (!sample || !bbox) return null;
    const N = 16;
    const { xmin, ymin, zmin, xmax, ymax, zmax } = bbox;
    const dx = (xmax - xmin) / N || 1e-6;
    const dy = (ymax - ymin) / N || 1e-6;
    const dz = (zmax - zmin) / N || 1e-6;
    const all: Float32Array[] = [];
    for (const fpts of sample.pts_q1000) {
      const occ = new Set<number>();
      for (const [px, py, pz] of fpts) {
        const wx = px / 1000, wy = py / 1000, wz = pz / 1000;
        const ix = Math.min(N - 1, Math.max(0, Math.floor((wx - xmin) / dx)));
        const iy = Math.min(N - 1, Math.max(0, Math.floor((wy - ymin) / dy)));
        const iz = Math.min(N - 1, Math.max(0, Math.floor((wz - zmin) / dz)));
        occ.add(ix + iy * N + iz * N * N);
      }
      const centers = new Float32Array(occ.size * 3);
      let idx = 0;
      for (const key of occ) {
        const ix = key % N;
        const iy = Math.floor(key / N) % N;
        const iz = Math.floor(key / (N * N));
        centers[idx * 3] = xmin + (ix + 0.5) * dx;
        centers[idx * 3 + 1] = ymin + (iy + 0.5) * dy;
        centers[idx * 3 + 2] = zmin + (iz + 0.5) * dz;
        idx++;
      }
      all.push(centers);
    }
    return { all, dx, dy, dz };
  }, [sample, bbox]);

  // lattice positions across all frames (same indexing → trivial corr.)
  // + forward-difference velocity (last frame = 0). This is what the
  // octonion source D should really use.
  const latticeFrames = useMemo(() => {
    if (!sample || !canonicalLattice || !perFrameBboxes || !perFrameOcc) return null;
    const Tn = sample.pts_q1000.length;
    const N = canonicalLattice.length;
    const positions: number[][][] = new Array(Tn);
    for (let t = 0; t < Tn; t++) {
      const bb = perFrameBboxes[t];
      const centers = perFrameOcc.all[t];
      const occCount = centers.length / 3;
      const { dx, dy, dz } = perFrameOcc;
      const fr: number[][] = new Array(N);
      for (let i = 0; i < N; i++) {
        const [u, v, w] = canonicalLattice[i];
        let tx = bb.cx + u * bb.hx;
        let ty = bb.cy + v * bb.hy;
        let tz = bb.cz + w * bb.hz;
        if (occCount > 0) {
          let best = Infinity;
          let bestIdx = 0;
          for (let k = 0; k < occCount; k++) {
            const ddx = tx - centers[k * 3];
            const ddy = ty - centers[k * 3 + 1];
            const ddz = tz - centers[k * 3 + 2];
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d2 < best) { best = d2; bestIdx = k; }
          }
          tx = centers[bestIdx * 3] + u * dx * 0.45;
          ty = centers[bestIdx * 3 + 1] + v * dy * 0.45;
          tz = centers[bestIdx * 3 + 2] + w * dz * 0.45;
        }
        fr[i] = [tx, ty, tz];
      }
      positions[t] = fr;
    }
    const velocities: number[][][] = new Array(Tn);
    for (let t = 0; t < Tn; t++) {
      velocities[t] = new Array(N);
      for (let i = 0; i < N; i++) {
        if (t < Tn - 1) {
          velocities[t][i] = [
            positions[t + 1][i][0] - positions[t][i][0],
            positions[t + 1][i][1] - positions[t][i][1],
            positions[t + 1][i][2] - positions[t][i][2],
          ];
        } else {
          velocities[t][i] = [0, 0, 0];
        }
      }
    }
    return { positions, velocities };
  }, [sample, canonicalLattice, perFrameBboxes, perFrameOcc]);

  // forward-difference velocity (last frame zero)
  const velocities = useMemo(() => {
    if (!sample) return null;
    const pts = sample.pts_q1000;
    const Tn = pts.length;
    const N = pts[0]?.length ?? 0;
    const v: number[][][] = [];
    for (let t = 0; t < Tn; t++) {
      const f: number[][] = [];
      for (let i = 0; i < N; i++) {
        if (t < Tn - 1) {
          f.push([
            pts[t + 1][i][0] - pts[t][i][0],
            pts[t + 1][i][1] - pts[t][i][1],
            pts[t + 1][i][2] - pts[t][i][2],
          ]);
        } else {
          f.push([0, 0, 0]);
        }
      }
      v.push(f);
    }
    return v;
  }, [sample]);

  // animate
  useEffect(() => {
    if (!playing || T === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last > 1000 / fps) {
        setFrame(f => (f + 1) % T);
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, T, fps]);

  // render
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !sample) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    if (c.width !== cw * dpr) {
      c.width = cw * dpr;
      c.height = ch * dpr;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, cw, ch);

    // grid floor
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      const a = project(i * 0.4, -0.7, -1.2, yaw, pitch, cw, ch, zoom, panX, panY);
      const b = project(i * 0.4, -0.7, 1.2, yaw, pitch, cw, ch, zoom, panX, panY);
      const cA = project(-1.2, -0.7, i * 0.4, yaw, pitch, cw, ch, zoom, panX, panY);
      const dB = project(1.2, -0.7, i * 0.4, yaw, pitch, cw, ch, zoom, panX, panY);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cA[0], cA[1]); ctx.lineTo(dB[0], dB[1]); ctx.stroke();
    }

    // world origin gnomon (always shown)
    {
      const origin = project(0, 0, 0, yaw, pitch, cw, ch, zoom, panX, panY);
      const axisLen = 0.25;
      const xEnd = project(axisLen, 0, 0, yaw, pitch, cw, ch, zoom, panX, panY);
      const yEnd = project(0, axisLen, 0, yaw, pitch, cw, ch, zoom, panX, panY);
      const zEnd = project(0, 0, axisLen, yaw, pitch, cw, ch, zoom, panX, panY);
      drawArrow2D(ctx, origin[0], origin[1], xEnd[0], xEnd[1], "#ef4444", 0.95);
      drawArrow2D(ctx, origin[0], origin[1], yEnd[0], yEnd[1], "#22c55e", 0.95);
      drawArrow2D(ctx, origin[0], origin[1], zEnd[0], zEnd[1], "#3b82f6", 0.95);
      // axis labels
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillStyle = "#ef4444"; ctx.fillText("X", xEnd[0] + 3, xEnd[1] + 3);
      ctx.fillStyle = "#22c55e"; ctx.fillText("Y", yEnd[0] + 3, yEnd[1] + 3);
      ctx.fillStyle = "#3b82f6"; ctx.fillText("Z", zEnd[0] + 3, zEnd[1] + 3);
      // origin dot + label
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(origin[0], origin[1], 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0b1020";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = "bold 10px ui-monospace, monospace";
      const label = "0 (dataset mean)";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(11, 16, 32, 0.85)";
      ctx.fillRect(origin[0] - tw / 2 - 3, origin[1] + 8, tw + 6, 14);
      ctx.fillStyle = "#fde047";
      ctx.textAlign = "center";
      ctx.fillText(label, origin[0], origin[1] + 19);
      ctx.textAlign = "start";
    }

    // bounding box + axis markers (drawn behind points)
    if (showBox && bbox) {
      const { xmin, ymin, zmin, xmax, ymax, zmax } = bbox;
      const corners: [number, number, number][] = [
        [xmin, ymin, zmin], [xmax, ymin, zmin], [xmax, ymax, zmin], [xmin, ymax, zmin],
        [xmin, ymin, zmax], [xmax, ymin, zmax], [xmax, ymax, zmax], [xmin, ymax, zmax],
      ];
      const projC = corners.map(([x, y, z]) => project(x, y, z, yaw, pitch, cw, ch, zoom, panX, panY));
      const edges: [number, number][] = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];
      ctx.strokeStyle = "rgba(125, 211, 252, 0.35)";
      ctx.lineWidth = 1;
      for (const [a, b] of edges) {
        ctx.beginPath();
        ctx.moveTo(projC[a][0], projC[a][1]);
        ctx.lineTo(projC[b][0], projC[b][1]);
        ctx.stroke();
      }

      // axis markers at face centers
      const cx = (xmin + xmax) / 2;
      const cy = (ymin + ymax) / 2;
      const cz = (zmin + zmax) / 2;
      const markers: { pos: [number, number, number]; label: string; color: string }[] = [
        { pos: [xmax, cy, cz], label: "RIGHT +X", color: "#f87171" },
        { pos: [xmin, cy, cz], label: "LEFT -X",  color: "#fca5a5" },
        { pos: [cx, ymax, cz], label: "UP +Y",    color: "#86efac" },
        { pos: [cx, ymin, cz], label: "DOWN -Y",  color: "#bbf7d0" },
        { pos: [cx, cy, zmax], label: "OUT +Z",   color: "#93c5fd" },
        { pos: [cx, cy, zmin], label: "IN -Z",    color: "#bfdbfe" },
      ];
      const center = project(cx, cy, cz, yaw, pitch, cw, ch, zoom, panX, panY);
      ctx.font = "bold 11px ui-monospace, monospace";
      for (const m of markers) {
        const p = project(m.pos[0], m.pos[1], m.pos[2], yaw, pitch, cw, ch, zoom, panX, panY);
        // line from box-center to face-center
        ctx.strokeStyle = m.color;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(center[0], center[1]);
        ctx.lineTo(p[0], p[1]);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // label
        ctx.fillStyle = m.color;
        const tw = ctx.measureText(m.label).width;
        ctx.fillStyle = "rgba(11, 16, 32, 0.85)";
        ctx.fillRect(p[0] - tw / 2 - 3, p[1] - 7, tw + 6, 14);
        ctx.fillStyle = m.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.label, p[0], p[1]);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }
    }

    const f = sample.pts_q1000[frame];
    const vf = velocities ? velocities[frame] : null;
    const cap = Math.min(numPoints, f.length);

    // single unified volume: voxelize points then render screen-space hull
    // of all occupied-voxel corners as one filled silhouette
    if (showVolume && bbox) {
      const { xmin, ymin, zmin, xmax, ymax, zmax } = bbox;
      const N = voxelRes;
      const dx = (xmax - xmin) / N || 1e-6;
      const dy = (ymax - ymin) / N || 1e-6;
      const dz = (zmax - zmin) / N || 1e-6;
      const occ = new Set<number>();
      for (let i = 0; i < cap; i++) {
        const [px, py, pz] = f[i];
        const wx = px / 1000, wy = py / 1000, wz = pz / 1000;
        const ix = Math.min(N - 1, Math.max(0, Math.floor((wx - xmin) / dx)));
        const iy = Math.min(N - 1, Math.max(0, Math.floor((wy - ymin) / dy)));
        const iz = Math.min(N - 1, Math.max(0, Math.floor((wz - zmin) / dz)));
        occ.add(ix + iy * N + iz * N * N);
      }

      // collect projected corners of every occupied voxel + the original points
      const allX: number[] = [];
      const allY: number[] = [];
      const corners: [number, number, number][] = [
        [-1, -1, -1], [ 1, -1, -1], [ 1,  1, -1], [-1,  1, -1],
        [-1, -1,  1], [ 1, -1,  1], [ 1,  1,  1], [-1,  1,  1],
      ];
      for (const key of occ) {
        const ix = key % N;
        const iy = Math.floor(key / N) % N;
        const iz = Math.floor(key / (N * N));
        const cx = xmin + (ix + 0.5) * dx;
        const cy = ymin + (iy + 0.5) * dy;
        const cz = zmin + (iz + 0.5) * dz;
        for (const [sx, sy, sz] of corners) {
          const [px2, py2] = project(
            cx + sx * dx / 2, cy + sy * dy / 2, cz + sz * dz / 2,
            yaw, pitch, cw, ch, zoom, panX, panY,
          );
          allX.push(px2);
          allY.push(py2);
        }
      }
      // also include raw point projections so silhouette tightly tracks them
      for (let i = 0; i < cap; i++) {
        const [px, py, pz] = f[i];
        const [sxv, syv] = project(px / 1000, py / 1000, pz / 1000, yaw, pitch, cw, ch, zoom, panX, panY);
        allX.push(sxv);
        allY.push(syv);
      }

      if (allX.length >= 3) {
        const hull = convexHull2D(allX, allY);
        ctx.fillStyle = "rgba(96, 165, 250, 0.20)";
        ctx.strokeStyle = "rgba(125, 211, 252, 0.7)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(hull[0][0], hull[0][1]);
        for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i][0], hull[i][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    type Item = {
      sxv: number; syv: number; depth: number; idx: number;
      // arrow endpoints (already projected)
      aEx?: number; aEy?: number;
      bEx?: number; bEy?: number;
    };
    const items: Item[] = [];
    for (let i = 0; showPoints && i < cap; i++) {
      const [px, py, pz] = f[i];
      const wx = px / 1000, wy = py / 1000, wz = pz / 1000;
      const [sxv, syv, depth] = project(wx, wy, wz, yaw, pitch, cw, ch, zoom, panX, panY);
      const it: Item = { sxv, syv, depth, idx: i };

      if (showGlyph && !showLattice) {
        // octonion D: o = (1, x, y, z, 1, vx, vy, vz)
        const aEx3 = wx + glyphScale * wx;
        const aEy3 = wy + glyphScale * wy;
        const aEz3 = wz + glyphScale * wz;
        const [aEx, aEy] = project(aEx3, aEy3, aEz3, yaw, pitch, cw, ch, zoom, panX, panY);
        it.aEx = aEx; it.aEy = aEy;

        if (vf) {
          const [vxq, vyq, vzq] = vf[i];
          const vx = vxq / 1000, vy = vyq / 1000, vz = vzq / 1000;
          const bEx3 = wx + velScale * vx;
          const bEy3 = wy + velScale * vy;
          const bEz3 = wz + velScale * vz;
          const [bEx, bEy] = project(bEx3, bEy3, bEz3, yaw, pitch, cw, ch, zoom, panX, panY);
          it.bEx = bEx; it.bEy = bEy;
        }
      }
      items.push(it);
    }
    items.sort((a, b) => b.depth - a.depth);

    for (const it of items) {
      const t = Math.max(0, Math.min(1, (5.0 - it.depth) / 4.0));
      const r = 1.8 + t * 2.2;
      const alpha = 0.4 + t * 0.55;
      const hue = 200 - t * 180;

      // arrows first (under point dot)
      if (showGlyph) {
        const aAlpha = 0.55 + t * 0.4;
        if (it.aEx !== undefined && it.aEy !== undefined) {
          drawArrow2D(ctx, it.sxv, it.syv, it.aEx, it.aEy, "#f43f5e", aAlpha);
        }
        if (it.bEx !== undefined && it.bEy !== undefined) {
          drawArrow2D(ctx, it.sxv, it.syv, it.bEx, it.bEy, "#22d3ee", aAlpha);
        }
      }

      ctx.fillStyle = `hsla(${hue}, 80%, ${30 + t * 30}%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(it.sxv, it.syv, r, 0, Math.PI * 2);
      ctx.fill();

      if (hoverIdx === it.idx) {
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(it.sxv, it.syv, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (showLabels) {
        const isHover = hoverIdx === it.idx;
        ctx.font = `${isHover ? "bold " : ""}10px ui-monospace, monospace`;
        ctx.fillStyle = isHover
          ? "#fde047"
          : `rgba(229, 231, 235, ${0.4 + t * 0.5})`;
        ctx.fillText(String(it.idx), it.sxv + r + 2, it.syv - r - 1);
      }
    }

    // corresponded lattice + octonion arrows on each lattice point.
    // pos = lattice world position; vel = forward diff of same-index
    // lattice point across frames (REAL motion since correspondence holds).
    if (showLattice && latticeFrames && latticeCount > 0) {
      const posF = latticeFrames.positions[frame];
      const velF = latticeFrames.velocities[frame];
      const nShow = Math.min(latticeCount, posF.length);
      type LP = {
        sxv: number; syv: number; depth: number; idx: number;
        aEx?: number; aEy?: number;
        bEx?: number; bEy?: number;
      };
      const lp: LP[] = [];
      for (let i = 0; i < nShow; i++) {
        const [tx, ty, tz] = posF[i];
        const [sxv, syv, depth] = project(tx, ty, tz, yaw, pitch, cw, ch, zoom, panX, panY);
        const it: LP = { sxv, syv, depth, idx: i };
        if (showGlyph) {
          const aE = project(tx + glyphScale * tx, ty + glyphScale * ty, tz + glyphScale * tz, yaw, pitch, cw, ch, zoom, panX, panY);
          it.aEx = aE[0]; it.aEy = aE[1];
          const [vx, vy, vz] = velF[i];
          const bE = project(tx + velScale * vx, ty + velScale * vy, tz + velScale * vz, yaw, pitch, cw, ch, zoom, panX, panY);
          it.bEx = bE[0]; it.bEy = bE[1];
        }
        lp.push(it);
      }
      lp.sort((a, b) => b.depth - a.depth);
      for (const p of lp) {
        const t = Math.max(0, Math.min(1, (5.0 - p.depth) / 4.0));
        const r = 2.5 + t * 2.2;
        if (showGlyph) {
          const aAlpha = 0.55 + t * 0.4;
          if (p.aEx !== undefined && p.aEy !== undefined) {
            drawArrow2D(ctx, p.sxv, p.syv, p.aEx, p.aEy, "#f43f5e", aAlpha);
          }
          if (p.bEx !== undefined && p.bEy !== undefined) {
            drawArrow2D(ctx, p.sxv, p.syv, p.bEx, p.bEy, "#22d3ee", aAlpha);
          }
        }
        ctx.fillStyle = `rgba(251, 191, 36, ${0.6 + t * 0.35})`;
        ctx.strokeStyle = `rgba(120, 53, 15, 0.7)`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(p.sxv, p.syv, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (hoverIdx === p.idx) {
          ctx.strokeStyle = "#fde047";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.sxv, p.syv, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (showLabels) {
          ctx.font = "9px ui-monospace, monospace";
          ctx.fillStyle = `rgba(254, 215, 170, ${0.7 + t * 0.3})`;
          ctx.fillText(`L${p.idx}`, p.sxv + r + 1, p.syv - r);
        }
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`f${frame.toString().padStart(2, "0")}/${T - 1}  pts ${cap}/${dataPoints}`, 8, ch - 8);

    // legend
    if (showGlyph) {
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#f43f5e";
      ctx.fillText("● pos-quat (e0..e3)", 8, 16);
      ctx.fillStyle = "#22d3ee";
      ctx.fillText("● vel-quat (e4..e7)", 8, 30);
    }
  }, [frame, yaw, pitch, sample, T, numPoints, dataPoints, showGlyph, glyphScale, velScale, velocities, hoverIdx, zoom, panX, panY, showBox, showPoints, showLabels, showVolume, voxelRes, showLattice, latticeCount, latticeFrames, bbox]);

  const onCanvasDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (e.button === 2) {
      dragging.current = { x: e.clientX, y: e.clientY, yaw, pitch };
    } else {
      panning.current = { x: e.clientX, y: e.clientY, panX, panY };
    }
  }, [yaw, pitch, panX, panY]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const factor = Math.exp(-e.deltaY * 0.0015);
    setZoom(z => Math.max(0.2, Math.min(20, z * factor)));
  }, []);

  // also block default scroll on canvas (React onWheel is passive in React 17+)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const block = (e: WheelEvent) => e.preventDefault();
    c.addEventListener("wheel", block, { passive: false });
    return () => c.removeEventListener("wheel", block);
  }, [sample]);

  // touch handlers (1 finger = rotate, 2 fingers = pinch zoom + pan)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const start = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchState.current = {
          mode: "rotate",
          x: t.clientX, y: t.clientY,
          yaw, pitch, panX, panY, dist: 0, zoom,
        };
      } else if (e.touches.length >= 2) {
        const a = e.touches[0], b = e.touches[1];
        const cx = (a.clientX + b.clientX) / 2;
        const cy = (a.clientY + b.clientY) / 2;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        touchState.current = {
          mode: "pinch",
          x: cx, y: cy,
          yaw, pitch, panX, panY, dist, zoom,
        };
      }
    };
    const move = (e: TouchEvent) => {
      e.preventDefault();
      const s = touchState.current;
      if (!s) return;
      if (s.mode === "rotate" && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        setYaw(s.yaw + dx * 0.01);
        setPitch(Math.max(-1.4, Math.min(1.4, s.pitch + dy * 0.01)));
      } else if (s.mode === "pinch" && e.touches.length >= 2) {
        const a = e.touches[0], b = e.touches[1];
        const cx = (a.clientX + b.clientX) / 2;
        const cy = (a.clientY + b.clientY) / 2;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const factor = dist / s.dist;
        setZoom(Math.max(0.2, Math.min(20, s.zoom * factor)));
        setPanX(s.panX + (cx - s.x));
        setPanY(s.panY + (cy - s.y));
      }
    };
    const end = () => { touchState.current = null; };
    c.addEventListener("touchstart", start, { passive: false });
    c.addEventListener("touchmove", move, { passive: false });
    c.addEventListener("touchend", end);
    c.addEventListener("touchcancel", end);
    return () => {
      c.removeEventListener("touchstart", start);
      c.removeEventListener("touchmove", move);
      c.removeEventListener("touchend", end);
      c.removeEventListener("touchcancel", end);
    };
  }, [sample, yaw, pitch, panX, panY, zoom]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragging.current;
      if (d) {
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        setYaw(d.yaw + dx * 0.01);
        setPitch(Math.max(-1.4, Math.min(1.4, d.pitch + dy * 0.01)));
      }
      const p = panning.current;
      if (p) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        setPanX(p.panX + dx);
        setPanY(p.panY + dy);
      }
    };
    const up = () => { dragging.current = null; panning.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  if (error) return <div style={{ color: "#fca5a5", padding: 24 }}>Failed: {error}</div>;
  if (!data || !sample) return (
    <div style={{ color: "#9ca3af", padding: 24, fontFamily: "ui-monospace, monospace" }}>
      Loading class3_viz.json...
    </div>
  );

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      background: "linear-gradient(180deg, #050816 0%, #0b1230 100%)",
      color: "#e5e7eb",
      fontFamily: "ui-monospace, monospace",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* title — top-left overlay */}
      <div style={{
        position: "absolute",
        top: 12,
        left: 12,
        padding: "8px 12px",
        background: "rgba(11, 16, 32, 0.78)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        zIndex: 10,
        maxWidth: 360,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          Class {data.target_class}: {data.class_names[data.target_class]}
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
          #{sample.idx} | pred:&nbsp;
          <b style={{ color: sample.correct ? "#bbf7d0" : "#fecaca" }}>
            {data.class_names[sample.pred_class]}
          </b> | {sample.correct ? "OK" : "WRONG"}
        </div>
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
          L-drag pan · R-drag rotate · wheel zoom · pinch · zoom {zoom.toFixed(2)}×
        </div>
      </div>

      {/* controls — bottom-left overlay (collapsible) */}
      <div style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        padding: panelOpen ? "12px 14px" : "6px 10px",
        background: "rgba(11, 16, 32, 0.85)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 8,
        zIndex: 10,
        maxWidth: 460,
        backdropFilter: "blur(6px)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 700,
          color: "#9ca3af",
          marginBottom: panelOpen ? 8 : 0,
        }}
          onClick={() => setPanelOpen(o => !o)}
        >
          <span>{panelOpen ? "▼" : "▶"} controls</span>
          <button
            onClick={(e) => { e.stopPropagation(); setPlaying(p => !p); }}
            style={{
              padding: "4px 12px",
              background: playing ? "#ef4444" : "#22c55e",
              color: "#0b1020",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "ui-monospace, monospace",
              fontWeight: 700,
              fontSize: 10,
            }}
          >
            {playing ? "pause" : "play"}
          </button>
        </div>
        {panelOpen && <div style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: "8px 12px",
        alignItems: "center",
        fontSize: 11,
      }}>
        <label>sample</label>
        <input
          type="range"
          min={0}
          max={data.samples_c3.length - 1}
          value={sampleIdx}
          onChange={e => { setSampleIdx(parseInt(e.target.value)); setFrame(0); }}
          style={{ width: "100%" }}
        />
        <span style={{ minWidth: 80, textAlign: "right" }}>
          {sampleIdx + 1} / {data.samples_c3.length}
        </span>

        <label>speed (fps)</label>
        <input
          type="range"
          min={1}
          max={30}
          value={fps}
          onChange={e => setFps(parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
        <span style={{ minWidth: 80, textAlign: "right" }}>{fps}</span>

        <label>points</label>
        <input
          type="range"
          min={0}
          max={MAX_POINTS}
          value={numPoints}
          onChange={e => setNumPoints(parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
        <span style={{ minWidth: 80, textAlign: "right" }}>
          {numPoints} (data {dataPoints})
        </span>

        <label>frame</label>
        <input
          type="range"
          min={0}
          max={Math.max(0, T - 1)}
          value={frame}
          onChange={e => setFrame(parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
        <span style={{ minWidth: 80, textAlign: "right" }}>{frame} / {T - 1}</span>

        <label>glyph</label>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showGlyph}
              onChange={e => setShowGlyph(e.target.checked)}
            />
            show octonion arrows
          </label>
          <span style={{ color: "#9ca3af" }}>pos-scale</span>
          <input
            type="range"
            min={0}
            max={50}
            value={Math.round(glyphScale * 100)}
            onChange={e => setGlyphScale(parseInt(e.target.value) / 100)}
            style={{ width: 100 }}
          />
          <span style={{ color: "#9ca3af" }}>vel-scale</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(velScale * 10)}
            onChange={e => setVelScale(parseInt(e.target.value) / 10)}
            style={{ width: 100 }}
          />
        </div>
        <span style={{ minWidth: 80, textAlign: "right", color: "#9ca3af" }}>
          {glyphScale.toFixed(2)} / {velScale.toFixed(1)}
        </span>

        <label>scene</label>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showBox}
              onChange={e => setShowBox(e.target.checked)}
            />
            bbox + axes
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showPoints}
              onChange={e => setShowPoints(e.target.checked)}
            />
            raw points
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={e => setShowLabels(e.target.checked)}
            />
            number points
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showVolume}
              onChange={e => setShowVolume(e.target.checked)}
            />
            volume
          </label>
          <span style={{ color: "#9ca3af" }}>vox</span>
          <input
            type="range"
            min={4}
            max={32}
            value={voxelRes}
            onChange={e => setVoxelRes(parseInt(e.target.value))}
            disabled={!showVolume}
            style={{ width: 100 }}
          />
          <span style={{ color: "#9ca3af", minWidth: 24 }}>{voxelRes}</span>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showLattice}
              onChange={e => setShowLattice(e.target.checked)}
            />
            lattice (corresponded)
          </label>
          <span style={{ color: "#9ca3af" }}>L#</span>
          <input
            type="range"
            min={1}
            max={512}
            value={latticeCount}
            onChange={e => setLatticeCount(parseInt(e.target.value))}
            disabled={!showLattice}
            style={{ width: 120 }}
          />
          <span style={{ color: "#9ca3af", minWidth: 32 }}>
            {latticeCount}/512
          </span>
          <span style={{ color: "#9ca3af" }}>zoom</span>
          <input
            type="range"
            min={20}
            max={2000}
            value={Math.round(zoom * 100)}
            onChange={e => setZoom(parseInt(e.target.value) / 100)}
            style={{ width: 140 }}
          />
          <button
            onClick={() => setZoom(1)}
            style={{
              padding: "2px 10px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 4,
              color: "#9ca3af",
              cursor: "pointer",
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
            }}
          >
            reset
          </button>
        </div>
        <span style={{ minWidth: 80, textAlign: "right", color: "#9ca3af" }}>
          {zoom.toFixed(2)}×
        </span>

        <label>inspect pt</label>
        <input
          type="range"
          min={-1}
          max={(showLattice ? latticeCount : Math.min(numPoints, dataPoints)) - 1}
          value={hoverIdx ?? -1}
          onChange={e => {
            const v = parseInt(e.target.value);
            setHoverIdx(v < 0 ? null : v);
          }}
          style={{ width: "100%" }}
        />
        <span style={{ minWidth: 80, textAlign: "right" }}>
          {hoverIdx === null ? "—" : (showLattice ? `L${hoverIdx}` : `pt ${hoverIdx}`)}
        </span>

        </div>}
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={onCanvasDown}
        onWheel={onWheel}
        onContextMenu={e => e.preventDefault()}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          cursor: "grab",
          touchAction: "none",
          zIndex: 1,
        }}
      />
      {hoverIdx !== null && sample && (() => {
        let p: number[], v: number[], src: string;
        if (showLattice && latticeFrames && hoverIdx < latticeFrames.positions[frame].length) {
          p = latticeFrames.positions[frame][hoverIdx].map(x => x * 1000);
          v = latticeFrames.velocities[frame][hoverIdx].map(x => x * 1000);
          src = `L${hoverIdx}`;
        } else if (velocities && hoverIdx < sample.pts_q1000[frame].length) {
          p = sample.pts_q1000[frame][hoverIdx];
          v = velocities[frame][hoverIdx];
          src = `pt ${hoverIdx}`;
        } else {
          return null;
        }
        const o: number[] = [
          1, p[0] / 1000, p[1] / 1000, p[2] / 1000,
          1, v[0] / 1000, v[1] / 1000, v[2] / 1000,
        ];
        const labels = ["e0", "e1 (x)", "e2 (y)", "e3 (z)", "e4", "e5 (vx)", "e6 (vy)", "e7 (vz)"];
        return (
          <div style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(11, 16, 32, 0.92)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "10px 12px",
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: "#e5e7eb",
            minWidth: 200,
            zIndex: 10,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: "#fde047" }}>
              octonion @ {src}, frame {frame}
            </div>
            <div style={{ color: "#f43f5e", marginBottom: 2 }}>pos-quat a = (e0..e3):</div>
            {o.slice(0, 4).map((val, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9ca3af" }}>{labels[i]}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {val.toFixed(4)}
                </span>
              </div>
            ))}
            <div style={{ color: "#22d3ee", margin: "6px 0 2px" }}>vel-quat b = (e4..e7):</div>
            {o.slice(4, 8).map((val, i) => (
              <div key={i + 4} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9ca3af" }}>{labels[i + 4]}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {val.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
