"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Sample = {
  class_name: string;
  subject: string;
  label: number;
  kin_xyz: number[][][];   // [frame][point][3]
  duo_xyz: number[][][];
  kin_uvd: number[][][];
  duo_uvd: number[][][];
};

type Data = {
  class_names: string[];
  samples: Sample[];
  frames_per_sample: number;
  points_per_frame: number;
};

function PointCloudPanel({ pts, t, title, projection }: {
  pts: number[][][]; t: number; title: string; projection: "XY" | "XZ" | "YZ" | "UV";
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 350, H = 350;
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    // Find global bounds across all frames
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    const get = (p: number[]): [number, number] => {
      if (projection === "XY") return [p[0], p[1]];
      if (projection === "XZ") return [p[0], p[2]];
      if (projection === "YZ") return [p[1], p[2]];
      return [p[0], p[1]]; // UV
    };
    for (const f of pts) for (const p of f) {
      const [x, y] = get(p);
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
    const pad = 20;
    const span = Math.max(xmax - xmin, ymax - ymin, 1);
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    const sx = (x: number) => W / 2 + (x - cx) / span * (W - 2 * pad);
    const sy = (y: number) => H / 2 + (y - cy) / span * (H - 2 * pad);
    // axis labels
    ctx.fillStyle = "#444";
    ctx.font = "10px monospace";
    ctx.fillText(projection, 6, H - 6);
    // bounds
    ctx.fillText(`[${xmin.toFixed(0)}, ${xmax.toFixed(0)}] × [${ymin.toFixed(0)}, ${ymax.toFixed(0)}]`, 6, 14);
    // current frame points
    const frame = pts[t % pts.length];
    ctx.fillStyle = "#7af";
    for (const p of frame) {
      const [x, y] = get(p);
      ctx.beginPath();
      ctx.arc(sx(x), sy(y), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Trail (previous 4 frames, fading)
    for (let dt = 4; dt >= 1; dt--) {
      const ti = (t - dt + pts.length) % pts.length;
      ctx.globalAlpha = 0.06 * (5 - dt);
      ctx.fillStyle = "#7af";
      for (const p of pts[ti]) {
        const [x, y] = get(p);
        ctx.beginPath();
        ctx.arc(sx(x), sy(y), 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }, [pts, t, projection]);
  return (
    <div style={{ display: "inline-block", margin: 6, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 4 }}>{title}</div>
      <canvas ref={ref} width={W} height={H} style={{ background: "#000", border: "1px solid #333" }} />
    </div>
  );
}

export default function DuoVsKinectPage() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(8);
  const [proj, setProj] = useState<"XY" | "XZ" | "YZ">("XY");
  const [usePixel, setUsePixel] = useState(false);

  useEffect(() => {
    fetch("/duo_vs_kinect.json").then(r => r.json()).then(setData).catch(e => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!playing || !data) return;
    const id = setInterval(() => setT(p => (p + 1) % data.frames_per_sample), 1000 / fps);
    return () => clearInterval(id);
  }, [playing, fps, data]);

  if (err) return <div style={{ color: "red", padding: 16 }}>error: {err}</div>;
  if (!data) return <div style={{ padding: 16, color: "#aaa" }}>loading…</div>;

  const sample = data.samples[sampleIdx];

  return (
    <main style={{ padding: 16, background: "#000", color: "#eee", fontFamily: "monospace", minHeight: "100vh" }}>
      <div style={{ marginBottom: 12 }}>
        <a href="/" style={{ color: "#6af" }}>back</a>
        {" | "}
        <a href="/extraction" style={{ color: "#6af" }}>extraction</a>
        {" | "}
        <a href="/c4-vs-c17" style={{ color: "#6af" }}>c4-vs-c17 game</a>
      </div>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Kinect depth vs DUO stereo — preprocessing sanity check</h1>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, fontSize: 12 }}>
        <label>sample:</label>
        <select value={sampleIdx} onChange={e => setSampleIdx(Number(e.target.value))} style={{ background: "#222", color: "#fff", border: "1px solid #444", padding: "2px 6px" }}>
          {data.samples.map((s, i) => (
            <option key={i} value={i}>{s.class_name} / {s.subject}</option>
          ))}
        </select>
        <button onClick={() => setPlaying(p => !p)} style={{ padding: "4px 10px", background: "#222", color: "#fff", border: "1px solid #444", cursor: "pointer" }}>
          {playing ? "pause" : "play"}
        </button>
        <input type="range" min={0} max={data.frames_per_sample - 1} value={t} onChange={e => { setPlaying(false); setT(Number(e.target.value)); }} style={{ width: 200 }} />
        <span style={{ minWidth: 40 }}>{t + 1}/{data.frames_per_sample}</span>
        <label>fps</label>
        <input type="range" min={1} max={20} value={fps} onChange={e => setFps(Number(e.target.value))} style={{ width: 100 }} />
        <span>{fps}</span>
        <label>projection:</label>
        <select value={proj} onChange={e => setProj(e.target.value as "XY"|"XZ"|"YZ")} style={{ background: "#222", color: "#fff", border: "1px solid #444", padding: "2px 6px" }}>
          <option>XY</option>
          <option>XZ</option>
          <option>YZ</option>
        </select>
        <label>
          <input type="checkbox" checked={usePixel} onChange={e => setUsePixel(e.target.checked)} /> show pixel-frame (uvd) instead of Cartesian
        </label>
      </div>

      <div>
        <PointCloudPanel
          pts={usePixel ? sample.kin_uvd : sample.kin_xyz}
          t={t}
          title={`KINECT — ${usePixel ? 'pixel uvd' : 'Cartesian XYZ (sherc unproj)'}`}
          projection={proj}
        />
        <PointCloudPanel
          pts={usePixel ? sample.duo_uvd : sample.duo_xyz}
          t={t}
          title={`DUO — ${usePixel ? 'pixel uvd' : 'Cartesian XYZ (cm via stereo)'}`}
          projection={proj}
        />
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#999" }}>
        Both panels show 128 random points per frame. Trail = past 4 frames fading.
        <br />
        Cartesian view: Kinect uses sherc unprojection (uvd → XYZ via fx=fy=463.889); DUO uses stereo triangulation (fx=fy=465 px, baseline=30 mm), Z in cm.
        <br />
        Pixel-frame view: raw row/col/depth-value channels actually fed to the model.
      </div>
    </main>
  );
}
