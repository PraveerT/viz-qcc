"use client";

import { useEffect, useRef, useState } from "react";

type Sample = {
  id: string;
  split: "train" | "test";
  sampleIndex: string;
  label: string;
  classDir: string;
  subject: string;
  clipDir: string;
  sourcePath: string;
  angleDeg: number;
  frameCount: number;
  pointCount: number;
  display: {
    center: [number, number, number];
    scale: number;
  };
  frames: number[][][];
};

type Payload = {
  meta: {
    dataset: string;
    channelSpace: string;
    cycleTransform: string;
    angleRangeDeg: [number, number];
    displayPointCount: number;
    rngSeed: number;
    note: string;
  };
  samples: Sample[];
};

const SPLITS: Array<Sample["split"]> = ["train", "test"];
const VARIANT_STYLES = {
  original: {
    title: "Original clip",
    color: "#1d4ed8",
  },
  cycle: {
    title: "Cycle transform",
    color: "#c2410c",
  },
} as const;

const VIEW_YAW = -0.72;
const VIEW_PITCH = 0.62;
const FRAME_INTERVAL_MS = 180;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatAngle(angleDeg: number) {
  const prefix = angleDeg >= 0 ? "+" : "";
  return `${prefix}${angleDeg.toFixed(1)} deg`;
}

function rotateCyclePoint(
  point: number[],
  angleRad: number
): [number, number, number] {
  const [x, y, z] = point;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  return [x * cosA - y * sinA, x * sinA + y * cosA, z];
}

function projectPoint(
  point: [number, number, number],
  center: [number, number, number],
  scale: number,
  width: number,
  height: number
) {
  let x = point[0] - center[0];
  let y = -(point[1] - center[1]);
  let z = point[2] - center[2];

  const cosYaw = Math.cos(VIEW_YAW);
  const sinYaw = Math.sin(VIEW_YAW);
  const xYaw = x * cosYaw - z * sinYaw;
  const zYaw = x * sinYaw + z * cosYaw;

  const cosPitch = Math.cos(VIEW_PITCH);
  const sinPitch = Math.sin(VIEW_PITCH);
  const yPitch = y * cosPitch - zYaw * sinPitch;
  const zPitch = y * sinPitch + zYaw * cosPitch;

  const fit = (Math.min(width, height) * 0.42) / Math.max(scale, 1e-3);
  const depthNorm = clamp(0.5 + 0.5 * (zPitch / Math.max(scale, 1e-3)), 0, 1);

  return {
    x: width / 2 + xYaw * fit,
    y: height / 2 - yPitch * fit,
    depthNorm,
  };
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = "#e7e5e4";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const x = (width / 4) * i;
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawCloud(
  canvas: HTMLCanvasElement,
  sample: Sample,
  frameIndex: number,
  variant: keyof typeof VARIANT_STYLES
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const angleRad = (sample.angleDeg * Math.PI) / 180;
  const frame = sample.frames[frameIndex] ?? sample.frames[0] ?? [];

  ctx.fillStyle = "#fafaf9";
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  for (const point of frame) {
    const renderedPoint: [number, number, number] =
      variant === "cycle"
        ? rotateCyclePoint(point, angleRad)
        : [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0];
    const projected = projectPoint(
      renderedPoint,
      sample.display.center,
      sample.display.scale,
      width,
      height
    );

    const alpha = 0.22 + projected.depthNorm * 0.55;
    const radius = 1.5 + projected.depthNorm * 1.7;
    const rgb =
      variant === "cycle" ? "194, 65, 12" : "29, 78, 216";

    ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#78716c";
  ctx.font = "11px monospace";
  ctx.fillText(`f${String(frameIndex).padStart(2, "0")}`, 8, height - 10);
}

function SampleCanvas({
  sample,
  frameIndex,
  variant,
}: {
  sample: Sample;
  frameIndex: number;
  variant: keyof typeof VARIANT_STYLES;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    drawCloud(ref.current, sample, frameIndex, variant);
  }, [sample, frameIndex, variant]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium" style={{ color: VARIANT_STYLES[variant].color }}>
          {VARIANT_STYLES[variant].title}
        </span>
        {variant === "cycle" ? (
          <span className="font-mono text-[var(--muted)]">
            {formatAngle(sample.angleDeg)}
          </span>
        ) : (
          <span className="font-mono text-[var(--muted)]">no rotation</span>
        )}
      </div>
      <canvas
        ref={ref}
        width={280}
        height={220}
        className="w-full rounded border border-[var(--card-border)] bg-[var(--chart-bg)]"
      />
    </div>
  );
}

function SampleCard({ sample, frameIndex }: { sample: Sample; frameIndex: number }) {
  return (
    <article className="rounded border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
        <span className="rounded bg-[var(--background)] px-2 py-1 font-medium uppercase tracking-wide">
          {sample.split}
        </span>
        <span className="font-mono">class {sample.label}</span>
        <span className="font-mono">{sample.subject}</span>
        <span className="font-mono">sample {sample.sampleIndex}</span>
      </div>

      <div className="mb-3 grid gap-3 md:grid-cols-2">
        <SampleCanvas sample={sample} frameIndex={frameIndex} variant="original" />
        <SampleCanvas sample={sample} frameIndex={frameIndex} variant="cycle" />
      </div>

      <div className="space-y-1 text-xs text-[var(--muted)]">
        <div className="font-mono">
          source: {sample.sourcePath}
        </div>
        <div className="font-mono">
          {sample.frameCount} frames x {sample.pointCount} displayed points
        </div>
      </div>
    </article>
  );
}

export default function PmambaRealSamples() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/pmamba-real-samples.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<Payload>;
      })
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        setFrameIndex(0);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "unknown error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!payload) return;
    const handle = window.setInterval(() => {
      setFrameIndex((frame) => (frame + 1) % payload.samples[0].frameCount);
    }, FRAME_INTERVAL_MS);
    return () => {
      window.clearInterval(handle);
    };
  }, [payload]);

  if (error) {
    return (
      <div className="rounded border border-[var(--red)] bg-[var(--card)] p-4 text-sm text-[var(--red)]">
        Failed to load PMamba sample payload: {error}
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
        Loading PMamba samples...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 text-xs sm:grid-cols-3">
        <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-3">
          <div className="mb-1 font-medium text-[var(--accent)]">Source</div>
          <p className="leading-relaxed text-[var(--muted)]">
            Six actual PMamba clips exported from <span className="font-mono">*_pts.npy</span>
            , split across train and test.
          </p>
        </div>
        <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-3">
          <div className="mb-1 font-medium text-[var(--orange)]">Cycle Op</div>
          <p className="leading-relaxed text-[var(--muted)]">
            The orange panel applies the same transform from{" "}
            <span className="font-mono">cycle_loss.py</span>: a Z-axis rotation on
            <span className="font-mono"> raw_input[..., 0:3]</span>.
          </p>
        </div>
        <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-3">
          <div className="mb-1 font-medium text-[var(--green)]">Display</div>
          <p className="leading-relaxed text-[var(--muted)]">
            Each clip shows 32 frames with 192 displayed points, looped in sync so the
            original and augmented motions are directly comparable.
          </p>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-[var(--muted)]">
        {payload.meta.note} The demo uses fixed angles sampled once from the same{" "}
        <span className="font-mono">
          [{payload.meta.angleRangeDeg[0]}, {payload.meta.angleRangeDeg[1]}]
        </span>{" "}
        degree range used during training so the visual comparison stays stable.
      </p>

      {SPLITS.map((split) => {
        const samples = payload.samples.filter((sample) => sample.split === split);
        return (
          <div key={split} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide">
                {split} clips
              </h3>
              <span className="font-mono text-xs text-[var(--muted)]">
                frame {String(frameIndex).padStart(2, "0")}
              </span>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {samples.map((sample) => (
                <SampleCard key={sample.id} sample={sample} frameIndex={frameIndex} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
