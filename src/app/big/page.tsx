"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Sample = {
  class: string;
  label: number;
  subject: string;
  mode?: "raw" | "correspondence" | "hungarian";
  held_per_frame?: number[];
  frames: number[][][]; // [T][N][3]
};

type Mode = "raw" | "correspondence" | "hungarian";
const MODES: Mode[] = ["raw", "correspondence", "hungarian"];
const POINT_COUNTS = [128, 512] as const;
type PointCount = (typeof POINT_COUNTS)[number];
type Key = `${Mode}-${PointCount}`;
const SAMPLE_URLS: Record<Key, string> = {
  "raw-128": "/sample_128.json",
  "correspondence-128": "/sample_128_corr.json",
  "hungarian-128": "/sample_128_hungarian.json",
  "raw-512": "/sample_512.json",
  "correspondence-512": "/sample_512_corr.json",
  "hungarian-512": "/sample_512_hungarian.json",
};

const MODE_COLORS: Record<Mode, string> = {
  raw: "#60a5fa",
  correspondence: "#f59e0b",
  hungarian: "#34d399",
};

const MODE_LABELS: Record<Mode, string> = {
  raw: "RAW",
  correspondence: "MUTUAL-NN",
  hungarian: "HUNGARIAN",
};

const SPEED_PRESETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8];

// Shortest-rotation quaternion from north (0,1,0) to a unit direction.
// Returns (w, x, y, z).
function quatFromNorth(dx: number, dy: number, dz: number): [number, number, number, number] {
  // cross = north × dir = (dz, 0, -dx)
  const cx = dz, cy = 0, cz = -dx;
  const cn = Math.sqrt(cx * cx + cz * cz);
  if (cn < 1e-6) {
    // dir parallel or anti-parallel to north
    return dy > 0 ? [1, 0, 0, 0] : [0, 1, 0, 0];
  }
  const ax = cx / cn, ay = cy / cn, az = cz / cn;
  const dot = Math.max(-1, Math.min(1, dy));
  const angle = Math.acos(dot);
  const h = angle * 0.5;
  const s = Math.sin(h);
  return [Math.cos(h), ax * s, ay * s, az * s];
}

// Rotate vector v by quaternion q (Rodrigues form).
function quatRotate(q: [number, number, number, number], vx: number, vy: number, vz: number): [number, number, number] {
  const [w, x, y, z] = q;
  const c1x = y * vz - z * vy;
  const c1y = z * vx - x * vz;
  const c1z = x * vy - y * vx;
  const c2x = y * c1z - z * c1y;
  const c2y = z * c1x - x * c1z;
  const c2z = x * c1y - y * c1x;
  return [
    vx + 2 * (w * c1x + c2x),
    vy + 2 * (w * c1y + c2y),
    vz + 2 * (w * c1z + c2z),
  ];
}

export default function BigPointCloud() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameAccumRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const animRef = useRef<number>(0);
  const yawRef = useRef(0);
  const speedRef = useRef(1);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; px: number; py: number } | null>(null);

  const [samples, setSamples] = useState<Partial<Record<Key, Sample>>>({});
  const [mode, setMode] = useState<Mode>("raw");
  const [nPts, setNPts] = useState<PointCount>(128);
  const sample = samples[`${mode}-${nPts}` as Key] ?? null;
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [autoSpin, setAutoSpin] = useState(true);
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0.25);
  const [frameIdx, setFrameIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showIds, setShowIds] = useState(true);
  const [idFontPx, setIdFontPx] = useState(9);
  const [showTops, setShowTops] = useState(false);
  const [showPoints, setShowPoints] = useState(true);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    (Object.keys(SAMPLE_URLS) as Key[]).forEach((k) => {
      fetch(SAMPLE_URLS[k])
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${k}: ${r.status}`))))
        .then((j: Sample) => setSamples((s) => ({ ...s, [k]: j })))
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

    const baseScale = Math.min(W, H) * 0.42;
    const scale = baseScale * zoomRef.current;
    const ox = W / 2 + panRef.current.x;
    const oy = H / 2 + panRef.current.y;

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

    if (showPoints) {
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
    }

    if (showTops) {
      // Compute per-frame centroid.
      let cxs = 0, cys = 0, czs = 0;
      for (const pt of pts) { cxs += pt[0]; cys += pt[1]; czs += pt[2]; }
      cxs /= pts.length; cys /= pts.length; czs /= pts.length;

      const tripodLen = 0.06;  // in normalized world units
      ctx.lineWidth = 1.2;

      // Collect tripod segments with depth for correct back-to-front draw order.
      type Seg = { sx1: number; sy1: number; sx2: number; sy2: number; depth: number; color: string };
      const segs: Seg[] = [];

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const dxw = p[0] - cxs, dyw = p[1] - cys, dzw = p[2] - czs;
        const nm = Math.sqrt(dxw * dxw + dyw * dyw + dzw * dzw) || 1e-6;
        const q = quatFromNorth(dxw / nm, dyw / nm, dzw / nm);

        // Apply q to canonical basis vectors -> three axes of the "top".
        const axes: [number[], string][] = [
          [quatRotate(q, 1, 0, 0), "#f87171"],  // red: rotated x
          [quatRotate(q, 0, 1, 0), "#34d399"],  // green: rotated y (= unit direction)
          [quatRotate(q, 0, 0, 1), "#60a5fa"],  // blue: rotated z
        ];

        const px0 = p[0], py0 = p[1], pz0 = p[2];
        const x1a = px0 * cy + pz0 * sy;
        const z1a = -px0 * sy + pz0 * cy;
        const y1a = py0 * cp - z1a * sp;
        const z2a = py0 * sp + z1a * cp;
        const sxA = ox + x1a * scale;
        const syA = oy - y1a * scale;

        for (const [axVec, color] of axes) {
          const tx = px0 + axVec[0] * tripodLen;
          const ty = py0 + axVec[1] * tripodLen;
          const tz = pz0 + axVec[2] * tripodLen;
          const x1b = tx * cy + tz * sy;
          const z1b = -tx * sy + tz * cy;
          const y1b = ty * cp - z1b * sp;
          const z2b = ty * sp + z1b * cp;
          const sxB = ox + x1b * scale;
          const syB = oy - y1b * scale;
          segs.push({ sx1: sxA, sy1: syA, sx2: sxB, sy2: syB, depth: (z2a + z2b) * 0.5, color });
        }
      }

      segs.sort((a, b) => a.depth - b.depth);
      for (const s of segs) {
        ctx.strokeStyle = s.color;
        ctx.beginPath();
        ctx.moveTo(s.sx1, s.sy1);
        ctx.lineTo(s.sx2, s.sy2);
        ctx.stroke();
      }
    }

    if (showIds && showPoints) {
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
    ctx.arc(ox, oy, baseScale * 1.05, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`frame ${fi.toString().padStart(2, "0")} / ${T - 1}`, 20, H - 82);
    ctx.fillText(nPts === 512 ? `N = 512 (all points)` : `N = 128 sampled from 512`, 20, H - 60);
    ctx.fillText(`speed ${speedRef.current.toFixed(2)}x`, 20, H - 38);
    ctx.fillText(`zoom ${zoomRef.current.toFixed(2)}x`, 20, H - 16);
    ctx.fillText(`yaw ${yawRef.current.toFixed(2)}  pitch ${pitch.toFixed(2)}`, W - 240, H - 16);

    if (autoSpin) yawRef.current += 0.012 * Math.max(0.25, speedRef.current);
    if (fi !== frameIdx) setFrameIdx(fi);
    animRef.current = requestAnimationFrame(draw);
  }, [sample, playing, autoSpin, pitch, frameIdx, showIds, idFontPx, nPts, showTops, showPoints]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2 - panRef.current.x;
      const my = e.clientY - rect.top - rect.height / 2 - panRef.current.y;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nextZoom = Math.min(8, Math.max(0.3, zoomRef.current * factor));
      const effective = nextZoom / zoomRef.current;
      panRef.current = {
        x: panRef.current.x - mx * (effective - 1),
        y: panRef.current.y - my * (effective - 1),
      };
      zoomRef.current = nextZoom;
    };

    const onDown = (e: MouseEvent) => {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        px: panRef.current.x,
        py: panRef.current.y,
      };
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      panRef.current = {
        x: d.px + (e.clientX - d.startX),
        y: d.py + (e.clientY - d.startY),
      };
    };
    const onUp = () => {
      dragRef.current = null;
      canvas.style.cursor = "grab";
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const resetView = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    yawRef.current = 0;
    setYaw(0);
    setPitch(0.25);
  }, []);

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
            {sample.class} · label {sample.label} · {sample.subject} · {sample.frames.length} frames × {sample.frames[0].length} pts · <span style={{ color: MODE_COLORS[mode], fontWeight: 600 }}>{MODE_LABELS[mode]}</span>
            {mode !== "raw" && sample.held_per_frame && (
              <span style={{ marginLeft: 8, color: "#475569" }}>
                · {sample.held_per_frame.reduce((a, b) => a + b, 0)}/{sample.frames[0].length * (sample.frames.length - 1)} holds ({(100 * sample.held_per_frame.reduce((a, b) => a + b, 0) / (sample.frames[0].length * (sample.frames.length - 1))).toFixed(0)}%)
              </span>
            )}
          </p>
        )}
        {err && <p style={{ color: "#f87171", fontSize: "0.85rem" }}>Failed to load sample: {err}</p>}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ display: "inline-flex", border: "1px solid #334155", borderRadius: 6, overflow: "hidden" }}>
            {MODES.map((m) => {
              const key = `${m}-${nPts}` as Key;
              const active = mode === m;
              const ready = !!samples[key];
              const color = MODE_COLORS[m];
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={!ready}
                  style={{
                    background: active ? color : "transparent",
                    color: active ? "#0b1220" : ready ? color : "#475569",
                    border: "none",
                    padding: "0.45rem 1rem",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: ready ? "pointer" : "not-allowed",
                    letterSpacing: "0.04em",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {MODE_LABELS[m]}
                </button>
              );
            })}
          </div>

          <div style={{ display: "inline-flex", border: "1px solid #334155", borderRadius: 6, overflow: "hidden" }}>
            {POINT_COUNTS.map((n) => {
              const key = `${mode}-${n}` as Key;
              const active = nPts === n;
              const ready = !!samples[key];
              return (
                <button
                  key={n}
                  onClick={() => setNPts(n)}
                  disabled={!ready}
                  style={{
                    background: active ? "#22d3ee" : "transparent",
                    color: active ? "#0b1220" : ready ? "#22d3ee" : "#475569",
                    border: "none",
                    padding: "0.45rem 1rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: ready ? "pointer" : "not-allowed",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {n} pts
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        style={{ borderRadius: 12, border: "1px solid #1e293b", boxShadow: "0 20px 60px rgba(0,0,0,0.4)", touchAction: "none" }}
      />
      <p style={{ fontSize: "0.72rem", color: "#475569", margin: "-0.5rem 0 0" }}>
        scroll to zoom · drag to pan · reset restores view
      </p>

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
        <button
          onClick={() => setShowTops((v) => !v)}
          style={btn(showTops ? "#a855f7" : "#1e293b")}
        >
          {showTops ? "hide tops" : "show tops"}
        </button>
        <button
          onClick={() => setShowPoints((v) => !v)}
          style={btn(showPoints ? "#1e293b" : "#475569")}
        >
          {showPoints ? "hide points" : "show points"}
        </button>
        <button onClick={resetView} style={btn("#1e293b")}>
          reset view
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
