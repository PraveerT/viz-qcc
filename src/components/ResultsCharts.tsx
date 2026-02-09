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
  ReferenceLine,
} from "recharts";

const weightSweepData = [
  { weight: "0.00", acc: 31.4, label: "baseline" },
  { weight: "0.01", acc: 43.3, label: "best" },
  { weight: "0.05", acc: 40.6, label: "" },
  { weight: "0.10", acc: 39.2, label: "lowest var" },
  { weight: "0.30", acc: 43.1, label: "" },
  { weight: "0.50", acc: 38.9, label: "" },
];

const comparisonData = [
  { method: "No QCC", mean: 30.7, std: 3.8 },
  { method: "QCC v2", mean: 28.8, std: 4.1 },
  { method: "QCC v3", mean: 39.4, std: 4.9 },
];

const COLORS = {
  baseline: "#6b7280",
  best: "#22c55e",
  normal: "#6366f1",
  v2: "#ef4444",
  v3: "#6366f1",
  none: "#6b7280",
};

function WeightSweepChart() {
  return (
    <div>
      <h4 className="mb-1 text-sm font-medium text-[var(--foreground)]">
        QCC Weight Sweep
      </h4>
      <p className="mb-4 text-xs text-[var(--muted)]">
        3 trials, 60 epochs each. Every non-zero weight beats baseline.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={weightSweepData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="weight"
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            label={{
              value: "QCC weight (\u03BB)",
              position: "insideBottom",
              offset: -2,
              fill: "#71717a",
              fontSize: 11,
            }}
          />
          <YAxis
            domain={[20, 50]}
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            label={{
              value: "Accuracy %",
              angle: -90,
              position: "insideLeft",
              offset: 18,
              fill: "#71717a",
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [`${value.toFixed(1)}%`, "Accuracy"]}
          />
          <ReferenceLine
            y={31.4}
            stroke="#6b7280"
            strokeDasharray="4 4"
            label={{
              value: "baseline",
              fill: "#6b7280",
              fontSize: 10,
              position: "right",
            }}
          />
          <Bar dataKey="acc" radius={[4, 4, 0, 0]}>
            {weightSweepData.map((entry, idx) => (
              <Cell
                key={idx}
                fill={
                  entry.label === "baseline"
                    ? COLORS.baseline
                    : entry.label === "best"
                    ? COLORS.best
                    : COLORS.normal
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComparisonChart() {
  return (
    <div>
      <h4 className="mb-1 text-sm font-medium text-[var(--foreground)]">
        No QCC vs QCC v2 vs QCC v3
      </h4>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Extended validation: 9 trials, 80 epochs. v3 wins 9/9 trials.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={comparisonData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="method" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
          <YAxis
            domain={[20, 50]}
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            label={{
              value: "Accuracy %",
              angle: -90,
              position: "insideLeft",
              offset: 18,
              fill: "#71717a",
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              `${value.toFixed(1)}%`,
              name === "mean" ? "Mean Accuracy" : "Std Dev",
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
          />
          <Bar dataKey="mean" name="Mean Accuracy" radius={[4, 4, 0, 0]}>
            {comparisonData.map((entry, idx) => (
              <Cell
                key={idx}
                fill={
                  entry.method === "QCC v3"
                    ? COLORS.v3
                    : entry.method === "QCC v2"
                    ? COLORS.v2
                    : COLORS.none
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatsTable() {
  const rows = [
    {
      metric: "Mean accuracy",
      none: "30.7%",
      v3: "39.4%",
      delta: "+8.8%",
      good: true,
    },
    {
      metric: "Std deviation",
      none: "\u00B13.8%",
      v3: "\u00B14.9%",
      delta: "",
      good: false,
    },
    {
      metric: "Trial wins",
      none: "0/9",
      v3: "9/9",
      delta: "",
      good: true,
    },
    {
      metric: "Optimal weight",
      none: "\u2014",
      v3: "\u03BB = 0.01",
      delta: "",
      good: false,
    },
  ];

  return (
    <div>
      <h4 className="mb-3 text-sm font-medium text-[var(--foreground)]">
        Key Numbers
      </h4>
      <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)] bg-[var(--card)]">
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--muted)]">
                Metric
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--muted)]">
                No QCC
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--accent)]">
                QCC v3
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--muted)]">
                Delta
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.metric}
                className="border-b border-[var(--card-border)] last:border-0"
              >
                <td className="px-4 py-2 text-[var(--muted)]">{r.metric}</td>
                <td className="px-4 py-2 text-right font-mono">{r.none}</td>
                <td className="px-4 py-2 text-right font-mono text-[var(--accent)]">
                  {r.v3}
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono ${
                    r.good ? "text-[#22c55e]" : "text-[var(--muted)]"
                  }`}
                >
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

export default function ResultsCharts() {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
          <WeightSweepChart />
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
          <ComparisonChart />
        </div>
      </div>
      <StatsTable />
    </div>
  );
}
