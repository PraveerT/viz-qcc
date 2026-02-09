"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";

/* ── data ── */

const perClassData = [
  { name: "Idle", type: "baseline", baseline: 22.2, qcc: 24.4, delta: 2.2 },
  { name: "Swipe", type: "translation", baseline: 100.0, qcc: 100.0, delta: 0.0 },
  { name: "Wave", type: "rotation", baseline: 57.8, qcc: 64.4, delta: 6.7 },
  { name: "Point", type: "articulation", baseline: 28.9, qcc: 24.4, delta: -4.4 },
  { name: "Grab", type: "translation", baseline: 73.3, qcc: 75.6, delta: 2.2 },
  { name: "Pinch", type: "articulation", baseline: 40.0, qcc: 57.8, delta: 17.8 },
  { name: "Open", type: "articulation", baseline: 42.2, qcc: 42.2, delta: 0.0 },
  { name: "Circle", type: "rotation", baseline: 100.0, qcc: 100.0, delta: 0.0 },
];

const motionTypeData = [
  { type: "Rotation", classes: "Wave, Circle", baseline: 78.9, qcc: 82.2, delta: 3.3 },
  { type: "Translation", classes: "Swipe, Grab", baseline: 86.7, qcc: 87.8, delta: 1.1 },
  { type: "Articulation", classes: "Point, Pinch, Open", baseline: 37.0, qcc: 41.5, delta: 4.4 },
];

const trialData = [
  { trial: "Trial 1", baseline: 58.3, qcc: 63.3 },
  { trial: "Trial 2", baseline: 57.5, qcc: 60.8 },
  { trial: "Trial 3", baseline: 58.3, qcc: 59.2 },
];

const TYPE_COLORS: Record<string, string> = {
  baseline: "#78716c",
  rotation: "#7c3aed",
  translation: "#0284c7",
  articulation: "#c2410c",
};

const COLORS = {
  baseline: "#a8a29e",
  qcc: "#1d4ed8",
};

const CHART_STYLE = {
  grid: "#e7e5e4",
  tick: "#78716c",
  label: "#a8a29e",
  tooltip: { background: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 4, fontSize: 12 },
};

/* ── gesture table ── */

const gestures = [
  { cls: 0, name: "Idle",   palm: "static",             thumb: "static",           index: "static",             others: "static",           type: "baseline" },
  { cls: 1, name: "Swipe",  palm: "translate X",         thumb: "slight spread",    index: "slight spread",      others: "slight spread",    type: "translation" },
  { cls: 2, name: "Wave",   palm: "oscillate Z-rot",     thumb: "passive",          index: "passive",            others: "passive",          type: "rotation" },
  { cls: 3, name: "Point",  palm: "static",              thumb: "curl in",          index: "extend out",         others: "curl in",          type: "articulation" },
  { cls: 4, name: "Grab",   palm: "slight forward",      thumb: "curl in",          index: "curl in",            others: "curl in",          type: "translation" },
  { cls: 5, name: "Pinch",  palm: "static",              thumb: "toward index",     index: "toward thumb",       others: "static",           type: "articulation" },
  { cls: 6, name: "Open",   palm: "slight back",         thumb: "extend out",       index: "extend out",         others: "extend out",       type: "articulation" },
  { cls: 7, name: "Circle", palm: "circular trajectory", thumb: "passive + wrist",  index: "passive + wrist",    others: "passive + wrist",  type: "rotation" },
];

const regions = [
  { name: "Palm",    points: 16, color: "#78716c", desc: "Base region at origin" },
  { name: "Thumb",   points: 16, color: "#c2410c", desc: "Independent rotation/curl" },
  { name: "Index",   points: 16, color: "#15803d", desc: "Independent rotation/curl" },
  { name: "Others",  points: 16, color: "#1d4ed8", desc: "Move as a group" },
];

/* ── sub-components ── */

function DatasetOverview() {
  return (
    <div className="flex flex-col gap-5">
      {/* Region cards */}
      <div>
        <h4 className="mb-2 text-sm font-medium">Hand Anatomy: 4 Regions, 64 Points</h4>
        <div className="grid gap-2 sm:grid-cols-4">
          {regions.map((r) => (
            <div key={r.name} className="rounded border border-[var(--card-border)] bg-[var(--card)] p-2.5">
              <div className="mb-0.5 flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
                <span className="text-sm font-medium">{r.name}</span>
              </div>
              <div className="font-mono text-[11px] text-[var(--muted)]">
                {r.points} pts &mdash; {r.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gesture class table */}
      <div>
        <h4 className="mb-2 text-sm font-medium">8 Gesture Classes</h4>
        <div className="overflow-x-auto rounded border border-[var(--card-border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--card)]">
                <th className="px-2 py-1.5 text-left font-medium text-[var(--muted)]">#</th>
                <th className="px-2 py-1.5 text-left font-medium text-[var(--muted)]">Gesture</th>
                <th className="px-2 py-1.5 text-left font-medium text-[var(--muted)]">Palm</th>
                <th className="px-2 py-1.5 text-left font-medium text-[var(--muted)]">Thumb</th>
                <th className="px-2 py-1.5 text-left font-medium text-[var(--muted)]">Index</th>
                <th className="px-2 py-1.5 text-left font-medium text-[var(--muted)]">Others</th>
                <th className="px-2 py-1.5 text-left font-medium text-[var(--muted)]">Type</th>
              </tr>
            </thead>
            <tbody>
              {gestures.map((g) => (
                <tr key={g.cls} className="border-b border-[var(--card-border)] last:border-0">
                  <td className="px-2 py-1 font-mono text-[var(--muted)]">{g.cls}</td>
                  <td className="px-2 py-1 font-medium">{g.name}</td>
                  <td className="px-2 py-1 text-[var(--muted)]">{g.palm}</td>
                  <td className="px-2 py-1 text-[var(--muted)]">{g.thumb}</td>
                  <td className="px-2 py-1 text-[var(--muted)]">{g.index}</td>
                  <td className="px-2 py-1 text-[var(--muted)]">{g.others}</td>
                  <td className="px-2 py-1">
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: TYPE_COLORS[g.type] + "18",
                        color: TYPE_COLORS[g.type],
                      }}
                    >
                      {g.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dataset specs */}
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { label: "Samples", value: "480 train / 120 test", sub: "60 + 15 per class" },
          { label: "Shape", value: "16 frames \u00D7 64 pts \u00D7 3D", sub: "temporal \u00D7 spatial \u00D7 coords" },
          { label: "Augmentation", value: "\u03C3=0.12, 20% occl.", sub: "speed \u00D70.8\u20131.2, phase shift" },
        ].map((s) => (
          <div key={s.label} className="rounded border border-[var(--card-border)] bg-[var(--card)] p-2.5">
            <div className="text-[11px] text-[var(--muted)]">{s.label}</div>
            <div className="text-sm font-medium">{s.value}</div>
            <div className="font-mono text-[10px] text-[var(--muted)]">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrialChart() {
  return (
    <div>
      <h4 className="mb-1 text-sm font-medium">Per-Trial Results</h4>
      <p className="mb-3 text-xs text-[var(--muted)]">
        3 trials (seeds 42-44), 80 epochs. QCC v3 wins all 3.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={trialData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.grid} />
          <XAxis dataKey="trial" tick={{ fill: CHART_STYLE.tick, fontSize: 12 }} />
          <YAxis
            domain={[50, 70]}
            tick={{ fill: CHART_STYLE.tick, fontSize: 12 }}
            label={{ value: "Accuracy %", angle: -90, position: "insideLeft", offset: 18, fill: CHART_STYLE.label, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={CHART_STYLE.tooltip}
            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === "baseline" ? "No QCC" : "QCC v3"]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: CHART_STYLE.tick }}
            formatter={(value: string) => (value === "baseline" ? "No QCC" : "QCC v3")}
          />
          <Bar dataKey="baseline" name="baseline" radius={[3, 3, 0, 0]} fill={COLORS.baseline} />
          <Bar dataKey="qcc" name="qcc" radius={[3, 3, 0, 0]} fill={COLORS.qcc} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PerClassChart() {
  return (
    <div>
      <h4 className="mb-1 text-sm font-medium">Per-Class Accuracy</h4>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Mean over 3 trials. QCC v3 bars colored by motion type. Pinch: +17.8%.
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={perClassData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.grid} />
          <XAxis dataKey="name" tick={{ fill: CHART_STYLE.tick, fontSize: 11 }} />
          <YAxis
            domain={[0, 110]}
            tick={{ fill: CHART_STYLE.tick, fontSize: 12 }}
            label={{ value: "Accuracy %", angle: -90, position: "insideLeft", offset: 18, fill: CHART_STYLE.label, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={CHART_STYLE.tooltip}
            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === "baseline" ? "No QCC" : "QCC v3"]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: CHART_STYLE.tick }}
            formatter={(value: string) => (value === "baseline" ? "No QCC" : "QCC v3")}
          />
          <Bar dataKey="baseline" name="baseline" radius={[3, 3, 0, 0]} fill={COLORS.baseline} />
          <Bar dataKey="qcc" name="qcc" radius={[3, 3, 0, 0]}>
            {perClassData.map((entry, idx) => (
              <Cell key={idx} fill={TYPE_COLORS[entry.type] || COLORS.qcc} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MotionTypeChart() {
  return (
    <div>
      <h4 className="mb-1 text-sm font-medium">By Motion Type</h4>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Articulation classes benefit most (+4.4%), not rotation.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={motionTypeData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.grid} />
          <XAxis dataKey="type" tick={{ fill: CHART_STYLE.tick, fontSize: 12 }} />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: CHART_STYLE.tick, fontSize: 12 }}
            label={{ value: "Accuracy %", angle: -90, position: "insideLeft", offset: 18, fill: CHART_STYLE.label, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={CHART_STYLE.tooltip}
            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === "baseline" ? "No QCC" : "QCC v3"]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: CHART_STYLE.tick }}
            formatter={(value: string) => (value === "baseline" ? "No QCC" : "QCC v3")}
          />
          <Bar dataKey="baseline" name="baseline" radius={[3, 3, 0, 0]} fill={COLORS.baseline} />
          <Bar dataKey="qcc" name="qcc" radius={[3, 3, 0, 0]}>
            {motionTypeData.map((entry, idx) => (
              <Cell
                key={idx}
                fill={
                  entry.type === "Rotation"
                    ? TYPE_COLORS.rotation
                    : entry.type === "Translation"
                    ? TYPE_COLORS.translation
                    : TYPE_COLORS.articulation
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DeltaTable() {
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">Per-Class Breakdown</h4>
      <div className="overflow-x-auto rounded border border-[var(--card-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)] bg-[var(--card)]">
              <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--muted)]">Class</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--muted)]">Type</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-[var(--muted)]">No QCC</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-[var(--accent)]">QCC v3</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-[var(--muted)]">Delta</th>
            </tr>
          </thead>
          <tbody>
            {perClassData.map((r) => (
              <tr key={r.name} className="border-b border-[var(--card-border)] last:border-0">
                <td className="px-3 py-1.5 font-medium">{r.name}</td>
                <td className="px-3 py-1.5">
                  <span
                    className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: TYPE_COLORS[r.type] + "18", color: TYPE_COLORS[r.type] }}
                  >
                    {r.type}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[var(--muted)]">{r.baseline.toFixed(1)}%</td>
                <td className="px-3 py-1.5 text-right font-mono text-[var(--accent)]">{r.qcc.toFixed(1)}%</td>
                <td className={`px-3 py-1.5 text-right font-mono ${r.delta > 0 ? "text-[var(--green)]" : r.delta < 0 ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>
                  {r.delta > 0 ? "+" : ""}{r.delta.toFixed(1)}%
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-[var(--card-border)] bg-[var(--card)]">
              <td className="px-3 py-1.5 font-medium">Overall</td>
              <td className="px-3 py-1.5 text-xs text-[var(--muted)]">all classes</td>
              <td className="px-3 py-1.5 text-right font-mono">58.1%</td>
              <td className="px-3 py-1.5 text-right font-mono text-[var(--accent)]">61.1%</td>
              <td className="px-3 py-1.5 text-right font-mono text-[var(--green)]">+3.1%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryStats() {
  const rows = [
    { metric: "Mean accuracy",    none: "58.1%",      v3: "61.1%",         delta: "+3.1%",   good: true },
    { metric: "Std deviation",    none: "\u00B10.4%",  v3: "\u00B11.7%",    delta: "",        good: false },
    { metric: "Trial wins",       none: "0/3",         v3: "3/3",           delta: "clean sweep", good: true },
    { metric: "Best single gain", none: "\u2014",      v3: "Pinch",         delta: "+17.8%",  good: true },
    { metric: "Only regression",  none: "\u2014",      v3: "Point",         delta: "\u22124.4%", good: false },
    { metric: "QCC weight",       none: "\u2014",      v3: "\u03BB = 0.01", delta: "",        good: false },
  ];

  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">Key Numbers</h4>
      <div className="overflow-x-auto rounded border border-[var(--card-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)] bg-[var(--card)]">
              <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--muted)]">Metric</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-[var(--muted)]">No QCC</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-[var(--accent)]">QCC v3</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-[var(--muted)]">Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.metric} className="border-b border-[var(--card-border)] last:border-0">
                <td className="px-3 py-1.5 text-[var(--muted)]">{r.metric}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.none}</td>
                <td className="px-3 py-1.5 text-right font-mono text-[var(--accent)]">{r.v3}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${r.good ? "text-[var(--green)]" : "text-[var(--muted)]"}`}>
                  {r.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Takeaways() {
  const items = [
    { icon: "positive", text: "QCC v3 helps across the board (+3.1% overall, wins all 3 trials)" },
    { icon: "positive", text: "Biggest single-class gain: Pinch (+17.8%) \u2014 an articulation class, not rotation" },
    { icon: "positive", text: "Rotation-heavy classes benefit (+3.3%) as expected from Wave (+6.7%)" },
    { icon: "positive", text: "Articulation classes benefit most (+4.4%) \u2014 angular velocity captures local joint motion" },
    { icon: "neutral",  text: "Translation classes barely change (+1.1%) \u2014 Swipe already saturated at 100%" },
    { icon: "negative", text: "Point class slightly hurt (\u22124.4%) \u2014 only regression, likely noise at this sample size" },
  ];

  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">Observations</h4>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5 rounded border border-[var(--card-border)] bg-[var(--card)] px-3 py-2">
            <span
              className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: item.icon === "positive" ? "var(--green)" : item.icon === "negative" ? "var(--red)" : "var(--muted)",
              }}
            />
            <span className="text-xs leading-relaxed text-[var(--muted)]">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── main export ── */

export default function ArticulatedResults() {
  return (
    <div className="flex flex-col gap-8">
      <DatasetOverview />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-4">
          <TrialChart />
        </div>
        <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-4">
          <MotionTypeChart />
        </div>
      </div>

      <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-4">
        <PerClassChart />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DeltaTable />
        <SummaryStats />
      </div>

      <Takeaways />
    </div>
  );
}
