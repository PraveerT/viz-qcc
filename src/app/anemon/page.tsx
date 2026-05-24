"use client";

import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "anemon_api_url";
const VIEW_KEY = "anemon_view_mode";
const POLL_MS = 10000;
const RECENT_EPOCHS = 12;

type EpochRow = {
  ep: number;
  tr_acc: number | null;
  tr_loss: number | null;
  aux_loss?: number | null;
  te_p1: number | null;
  te_p5: number | null;
};

type LBRow = Record<string, string>;
type Leaderboard = Record<string, LBRow[][]> | null | undefined;

type Status = {
  ts?: string;
  run?: string;
  log?: string;
  gpu?: { used_gb: number; total_gb: number; util_pct: number } | null;
  ram?: { used_gb: number; total_gb: number } | null;
  disk?: { used_gb: number; total_gb: number } | null;
  epochs?: EpochRow[];
  best?: { ep: number; p1: number } | null;
  now?: { ep?: number; batch?: string; lr?: number | null };
  leaderboard?: Leaderboard;
  engram?: { epoch: number; out_norm: number; out_max: number } | null;
  qcc?: {
    epoch: number;
    qcc_scale: number;
    quat_inject_scale?: number;
    quat_inject_norm?: number;
    quat_inject_max?: number;
  } | null;
  cluster?: {
    epoch: number;
    cycle_proj_norm: number;
    cycle_proj_max: number;
    cluster_head_norm?: number;
    cluster_mass?: number[];
  } | null;
  param_counts?: {
    epoch: number;
    total_m: number;
    aux_m: number;
    main_m: number;
  } | null;
  misclass?: { cls: number; wrong: number; total: number; pct: number }[] | null;
  cnxxl_delta?: { ep: number; te: number; base_te: number; delta: number }[] | null;
  refs?: {
    current_best: number;
    refs: { name: string; value: number; delta: number }[];
  } | null;
};

const fmt = (n: number | null | undefined, d = 1) =>
  n == null || Number.isNaN(n) ? "—" : Number(n).toFixed(d);

function stripMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\s*\*\([^)]*\)\*/g, "")
    .trim();
}

function Bar({ pct, warn = 70, bad = 90 }: { pct: number; warn?: number; bad?: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= bad ? "#f66" : clamped >= warn ? "#fb6" : "#6bf";
  return (
    <div style={{ background: "#141414", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 3 }}>
      <div style={{ width: `${clamped}%`, height: "100%", background: color, transition: "width 0.3s" }} />
    </div>
  );
}

function KV({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 70 }}>
      <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px" }}>{k}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: color || "#e8e8e8" }}>{v}</span>
    </div>
  );
}

function CompactTable({ rows }: { rows: LBRow[] }) {
  if (!rows || rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
      <thead>
        <tr>
          {cols.map((c, i) => (
            <th key={c} style={{
              padding: "3px 4px",
              textAlign: i === cols.length - 1 ? "right" : "left",
              color: "#888",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.4px",
              fontSize: 9,
              borderBottom: "1px solid #252525",
            }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {cols.map((c, i) => {
              const v = stripMd(r[c] ?? "");
              const isAcc = i === cols.length - 1 && /^[\d.]+$/.test(v);
              return (
                <td key={c} style={{
                  padding: "3px 4px",
                  textAlign: i === cols.length - 1 ? "right" : "left",
                  color: isAcc ? "#6f9" : "#d0d0d0",
                  fontWeight: isAcc ? 600 : 400,
                  wordBreak: "break-word",
                  lineHeight: 1.3,
                  verticalAlign: "top",
                }}>{v}</td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AnemonPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"compact" | "detailed">("compact");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "detailed" || saved === "compact") setViewMode(saved);
    }
  }, []);
  const toggleView = useCallback(() => {
    setViewMode((m) => {
      const next = m === "compact" ? "detailed" : "compact";
      if (typeof window !== "undefined") window.localStorage.setItem(VIEW_KEY, next);
      return next;
    });
  }, []);
  const [, setErr] = useState<string | null>(null);
  const [ago, setAgo] = useState<string>("…");

  // Lock the browser so the page itself can't scroll.
  useEffect(() => {
    const prevHtml = document.documentElement.style.cssText;
    const prevBody = document.body.style.cssText;
    document.documentElement.style.cssText =
      "height:100%;overflow:hidden;overscroll-behavior:none;background:#0a0a0a;";
    document.body.style.cssText =
      "height:100%;margin:0;overflow:hidden;overscroll-behavior:none;background:#0a0a0a;position:fixed;inset:0;touch-action:none;";
    return () => {
      document.documentElement.style.cssText = prevHtml;
      document.body.style.cssText = prevBody;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("api");
    if (fromQuery) {
      localStorage.setItem(STORAGE_KEY, fromQuery);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const q = stored ? `?api=${encodeURIComponent(stored)}` : "";
      const r = await fetch(`/api/anemon-status${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: Status = await r.json();
      setStatus(data);
      setLastOk(Date.now());
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!lastOk) { setAgo("…"); return; }
      const s = Math.round((Date.now() - lastOk) / 1000);
      setAgo(s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`);
    }, 1000);
    return () => clearInterval(id);
  }, [lastOk]);

  const last = status?.epochs && status.epochs.length > 0 ? status.epochs[status.epochs.length - 1] : null;
  const bestEp = status?.best?.ep;
  const stale = lastOk != null && (Date.now() - lastOk) / 1000 > 30;
  const allEpochs = status?.epochs ?? [];
  const detailed = viewMode === "detailed";
  const tableRows = detailed ? [...allEpochs].reverse() : allEpochs.slice(-RECENT_EPOCHS).reverse();
  const teValues = allEpochs.map((e) => e.te_p1 ?? 0);
  const lastGap = last && last.tr_acc != null && last.te_p1 != null ? last.tr_acc - last.te_p1 : null;

  return (
    <main style={{
      position: "fixed",
      inset: 0,
      background: "#0a0a0a",
      color: "#e8e8e8",
      font: "13px/1.45 ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
      padding: "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      overflow: detailed ? "auto" : "hidden",
      overscrollBehavior: "none",
      touchAction: detailed ? "auto" : "none",
    }}>
      <header style={{ padding: "14px 16px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <h1 style={{ font: "600 16px/1 inherit", margin: 0, letterSpacing: "0.5px" }}>
          ANEMON · <span style={{ color: "#6bf" }}>{status?.run ?? "—"}</span>
        </h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={toggleView}
            style={{
              background: detailed ? "#1e3a5f" : "#0f141b",
              color: detailed ? "#bfe1ff" : "#9ca3af",
              border: "1px solid " + (detailed ? "#2d5a8a" : "#1f2937"),
              borderRadius: 5,
              padding: "4px 10px",
              fontSize: 10,
              fontFamily: "inherit",
              cursor: "pointer",
              letterSpacing: "0.6px",
              textTransform: "uppercase",
            }}
            aria-label={detailed ? "switch to compact view" : "switch to detailed view"}
          >
            {detailed ? "compact" : "details"}
          </button>
          <span style={{ fontSize: 11, color: stale ? "#fb6" : "#888" }}>{ago}</span>
        </div>
      </header>

      <section style={{ padding: "8px 16px", borderTop: "1px solid #252525", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <KV k="epoch" v={status?.now?.ep != null ? String(status.now.ep) : "—"} />
          <KV k="batch" v={status?.now?.batch ?? "—"} />
          <KV k="lr" v={status?.now?.lr != null ? status.now.lr.toExponential(1) : "—"} />
          <KV k="best p1" v={status?.best ? `${fmt(status.best.p1, 2)}% (ep ${status.best.ep})` : "—"} color="#6f9" />
          <KV k="last p1" v={last ? `${fmt(last.te_p1, 2)}%` : "—"} />
          <KV k="last p5" v={last ? `${fmt(last.te_p5, 2)}%` : "—"} />
        </div>
      </section>

      <section style={{ padding: "8px 16px", borderTop: "1px solid #252525", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <KV k="gpu mem" v={status?.gpu ? `${fmt(status.gpu.used_gb, 1)} / ${fmt(status.gpu.total_gb, 1)} GB` : "—"} />
            {status?.gpu && <Bar pct={(status.gpu.used_gb / status.gpu.total_gb) * 100} warn={80} bad={95} />}
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <KV k="gpu util" v={status?.gpu ? `${status.gpu.util_pct}%` : "—"} />
            {status?.gpu && <Bar pct={status.gpu.util_pct} warn={101} bad={102} />}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <KV k="ram" v={status?.ram ? `${status.ram.used_gb} / ${status.ram.total_gb} GB` : "—"} />
            {status?.ram && <Bar pct={(status.ram.used_gb / status.ram.total_gb) * 100} />}
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <KV k="disk" v={status?.disk ? `${fmt(status.disk.used_gb, 1)} / ${status.disk.total_gb} GB` : "—"} />
            {status?.disk && <Bar pct={(status.disk.used_gb / status.disk.total_gb) * 100} />}
          </div>
        </div>
      </section>

      {detailed && allEpochs.length > 0 && (() => {
        const auxVals = allEpochs.map(e => e.aux_loss).filter((v): v is number => v != null);
        const lossVals = allEpochs.map(e => e.tr_loss).filter((v): v is number => v != null);
        const lastAux = last?.aux_loss;
        const lastTrLoss = last?.tr_loss;
        // Mechanism contribution = aux_loss / total_loss at last epoch.
        // tr_loss in main.py is the MEAN training loss = mean(CE + aux). So
        // aux_share = aux / tr_loss approximates the share aux takes of the
        // optimizer's gradient signal.
        const auxShare = (lastAux != null && lastTrLoss != null && lastTrLoss > 0)
          ? lastAux / lastTrLoss : null;
        const teMin = Math.min(...teValues);
        const teMax = Math.max(...teValues);
        const gaps = allEpochs
          .filter(e => e.tr_acc != null && e.te_p1 != null)
          .map(e => (e.tr_acc! - e.te_p1!));
        const maxGap = gaps.length ? Math.max(...gaps) : null;
        const minGap = gaps.length ? Math.min(...gaps) : null;
        const tot = (auxVals.length ? auxVals.reduce((a,b)=>a+b,0)/auxVals.length : null);
        const cyc = status?.cluster;
        const qcc = status?.qcc;
        const eng = status?.engram;
        return (
          <section style={{ padding: "8px 16px", borderTop: "1px solid #252525", flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
              detailed metrics
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
              <KV k="epochs" v={String(allEpochs.length)} />
              <KV k="best p1" v={status?.best ? `${fmt(status.best.p1, 2)}` : "—"} color="#6f9" />
              <KV k="last p1" v={last?.te_p1 != null ? fmt(last.te_p1, 2) : "—"} />
              <KV k="te range" v={teValues.length ? `${teMin.toFixed(1)}–${teMax.toFixed(1)}` : "—"} />
              <KV k="last gap" v={lastGap != null ? lastGap.toFixed(2) : "—"} color={lastGap != null && lastGap > 8 ? "#fb6" : "#e8e8e8"} />
              <KV k="max gap" v={maxGap != null ? maxGap.toFixed(2) : "—"} color={maxGap != null && maxGap > 15 ? "#fb6" : "#e8e8e8"} />
              <KV k="min gap" v={minGap != null ? minGap.toFixed(2) : "—"} />
              <KV k="best − last" v={status?.best && last?.te_p1 != null ? (status.best.p1 - last.te_p1).toFixed(2) : "—"} />
              <KV k="aux/total" v={auxShare != null ? `${(auxShare*100).toFixed(1)}%` : "—"} color={auxShare != null && auxShare > 0.5 ? "#fb6" : auxShare != null && auxShare > 0.1 ? "#bfe1ff" : "#e8e8e8"} />
              <KV k="mean aux" v={tot != null ? tot.toExponential(2) : "—"} />
              <KV k="last loss" v={lastTrLoss != null ? lastTrLoss.toFixed(3) : "—"} />
              <KV k="last aux" v={lastAux != null ? lastAux.toExponential(2) : "—"} />
            </div>
            {(cyc || qcc || eng) && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #252525" }}>
                <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                  mechanism weights (zero-init residuals; growth = activity)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
                  {cyc && (
                    <>
                      <KV k="cycle_proj" v={cyc.cycle_proj_norm.toFixed(4)} color={cyc.cycle_proj_norm > 0.01 ? "#6bf" : "#f88"} />
                      <KV k="cycle_max" v={cyc.cycle_proj_max.toFixed(4)} />
                      {cyc.cluster_head_norm != null && (
                        <KV k="cluster_head" v={cyc.cluster_head_norm.toFixed(3)} />
                      )}
                    </>
                  )}
                  {qcc && (
                    <>
                      <KV k="qcc_scale" v={qcc.qcc_scale.toFixed(4)} color={Math.abs(qcc.qcc_scale) > 0.005 ? "#6bf" : "#f88"} />
                      {qcc.quat_inject_scale !== undefined && (
                        <KV k="quat_inject" v={qcc.quat_inject_scale.toFixed(4)} color={Math.abs(qcc.quat_inject_scale) > 0.005 ? "#6bf" : "#f88"} />
                      )}
                    </>
                  )}
                  {eng && (
                    <>
                      <KV k="engram_out" v={eng.out_norm.toFixed(4)} color={eng.out_norm > 0.01 ? "#6bf" : "#f88"} />
                      <KV k="engram_max" v={eng.out_max.toFixed(4)} />
                    </>
                  )}
                </div>
              </div>
            )}
            {status?.refs && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #252525" }}>
                <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                  best so far vs reference runs
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11 }}>
                  <div style={{ background: "#0f141b", border: "1px solid #2d5a8a", borderRadius: 4, padding: "4px 8px", display: "flex", flexDirection: "column", minWidth: 80 }}>
                    <span style={{ fontSize: 9, color: "#888" }}>current best</span>
                    <span style={{ color: "#6f9", fontWeight: 700 }}>{status.refs.current_best.toFixed(2)}</span>
                  </div>
                  {status.refs.refs.map(r => {
                    const dc = r.delta > 0.5 ? "#6f9" : r.delta > 0 ? "#bfe1ff" : r.delta < -1.5 ? "#f88" : "#fc9";
                    return (
                      <div key={r.name} style={{
                        background: "#0f141b", border: "1px solid #1f2937", borderRadius: 4,
                        padding: "4px 8px", display: "flex", flexDirection: "column", minWidth: 80,
                      }}>
                        <span style={{ fontSize: 9, color: "#888" }}>vs {r.name} ({r.value})</span>
                        <span style={{ color: dc, fontWeight: 600 }}>
                          {r.delta > 0 ? "+" : ""}{r.delta.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {status?.cnxxl_delta && status.cnxxl_delta.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #252525" }}>
                <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                  delta vs cnxxlquat 91.08 baseline (per ep)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11 }}>
                  {status.cnxxl_delta.map(d => {
                    const dc = d.delta > 1 ? "#6f9" : d.delta > 0 ? "#bfe1ff" : d.delta < -2 ? "#f88" : "#fc9";
                    return (
                      <div key={d.ep} style={{
                        background: "#0f141b", border: "1px solid #1f2937", borderRadius: 4,
                        padding: "3px 6px", display: "flex", flexDirection: "column", minWidth: 56,
                      }}>
                        <span style={{ fontSize: 9, color: "#888" }}>ep {d.ep}</span>
                        <span style={{ color: dc, fontWeight: 600 }}>
                          {d.delta > 0 ? "+" : ""}{d.delta.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {status?.param_counts && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #252525" }}>
                <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                  param counts (M)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
                  <KV k="total" v={`${status.param_counts.total_m}M`} />
                  <KV k="main" v={`${status.param_counts.main_m}M`} />
                  <KV k="aux" v={`${status.param_counts.aux_m}M`} color="#bfe1ff" />
                  <KV k="aux %" v={`${(100 * status.param_counts.aux_m / Math.max(status.param_counts.total_m, 1e-9)).toFixed(1)}%`} />
                </div>
              </div>
            )}
            {cyc?.cluster_mass && cyc.cluster_mass.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #252525" }}>
                <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                  per-cluster mass (ema; uniform = 1/K = {fmt(1.0 / cyc.cluster_mass.length, 3)})
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
                  {cyc.cluster_mass.map((m, i) => {
                    const target = 1.0 / cyc.cluster_mass!.length;
                    const ratio = m / target;
                    const color = ratio > 2 ? "#fb6" : ratio > 1.4 ? "#fc9" : ratio < 0.4 ? "#f88" : "#6bf";
                    const h = Math.max(2, Math.min(60, m * 200));
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{ fontSize: 9, color: "#888" }}>{(m * 100).toFixed(1)}</div>
                        <div style={{ width: "100%", background: color, height: `${h}px`, borderRadius: 2 }} />
                        <div style={{ fontSize: 9, color: "#666" }}>k{i}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {status?.misclass && status.misclass.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #252525" }}>
                <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                  worst classes (test confusion)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11 }}>
                  {status.misclass.map(m => (
                    <div key={m.cls} style={{
                      background: "#0f141b", border: "1px solid #1f2937", borderRadius: 4,
                      padding: "3px 7px", display: "flex", flexDirection: "column", minWidth: 64,
                    }}>
                      <span style={{ fontSize: 9, color: "#888" }}>cls {m.cls}</span>
                      <span style={{ color: m.pct > 50 ? "#f88" : m.pct > 25 ? "#fb6" : "#fc9", fontWeight: 600 }}>
                        {m.wrong}/{m.total} ({m.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 8 }}>
              aux/total = aux_loss share of training loss · gap = train% − test% · log {status?.log?.split("/").slice(-2)[0] ?? "—"}
            </div>
          </section>
        );
      })()}

      <section style={{ padding: "8px 16px", borderTop: "1px solid #252525", flex: detailed ? "0 0 auto" : 1, minHeight: 0, overflow: detailed ? "visible" : "hidden", display: "flex", flexDirection: "column" }}>
        {(() => {
          const hasAux = tableRows.some(e => e.aux_loss != null);
          const baseHeaders = hasAux
            ? ["ep", "tr%", "loss", "aux", "te p1", "te p5"]
            : ["ep", "tr%", "loss", "te p1", "te p5"];
          const headers = detailed ? [...baseHeaders, "gap"] : baseHeaders;
          const fmtAux = (v: number | null | undefined) =>
            v == null || Number.isNaN(v) ? "—" : Number(v).toExponential(1);
          return (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={h} style={{
                      padding: "4px 6px",
                      textAlign: i === 0 ? "left" : "right",
                      color: "#888",
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                      fontSize: 10,
                      borderBottom: "1px solid #252525",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((e) => {
                  const isBest = e.ep === bestEp;
                  const color = isBest ? "#6f9" : "#e8e8e8";
                  const weight = isBest ? 700 : 400;
                  const gap = e.tr_acc != null && e.te_p1 != null ? e.tr_acc - e.te_p1 : null;
                  const baseCells = hasAux
                    ? [String(e.ep), fmt(e.tr_acc, 1), fmt(e.tr_loss, 3), fmtAux(e.aux_loss), fmt(e.te_p1, 2), fmt(e.te_p5, 2)]
                    : [String(e.ep), fmt(e.tr_acc, 1), fmt(e.tr_loss, 3), fmt(e.te_p1, 2), fmt(e.te_p5, 2)];
                  const cells = detailed ? [...baseCells, gap != null ? gap.toFixed(2) : "—"] : baseCells;
                  return (
                    <tr key={e.ep}>
                      {cells.map((v, i) => {
                        const isGap = detailed && i === cells.length - 1 && gap != null;
                        const gapColor = isGap && gap! > 10 ? "#fb6" : isGap && gap! > 5 ? "#fc9" : color;
                        return (
                          <td key={i} style={{
                            padding: "4px 6px",
                            textAlign: i === 0 ? "left" : "right",
                            color: gapColor, fontWeight: weight,
                          }}>{v}</td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}
      </section>

      {status?.leaderboard?.["Top combo per fusion width (with DSN)"]?.[0] && (
        <section style={{ padding: "8px 16px", borderTop: "1px solid #252525", flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>top by fusion width</div>
          <CompactTable rows={status.leaderboard["Top combo per fusion width (with DSN)"][0]} />
        </section>
      )}

      {status?.engram && (
        <section style={{ padding: "8px 16px", borderTop: "1px solid #252525", flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>engram aux contribution</div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#e5e7eb" }}>
            <div>ep {status.engram.epoch}</div>
            <div>
              out_proj norm{" "}
              <span style={{ color: status.engram.out_norm > 0.01 ? "#6bf" : "#f88", fontWeight: 600 }}>
                {status.engram.out_norm.toFixed(4)}
              </span>
            </div>
            <div style={{ color: "#888" }}>max {status.engram.out_max.toFixed(4)}</div>
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
            zero-init residual; blue = contributing, red = suppressed
          </div>
        </section>
      )}

      {status?.qcc && (
        <section style={{ padding: "8px 16px", borderTop: "1px solid #252525", flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>qcc mechanism usage</div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#e5e7eb", flexWrap: "wrap" }}>
            <div>ep {status.qcc.epoch}</div>
            <div>
              qcc_scale{" "}
              <span style={{ color: Math.abs(status.qcc.qcc_scale) > 0.005 ? "#6bf" : "#f88", fontWeight: 600 }}>
                {status.qcc.qcc_scale.toFixed(4)}
              </span>
            </div>
            {status.qcc.quat_inject_scale !== undefined && (
              <div>
                quat_inject_scale{" "}
                <span style={{ color: Math.abs(status.qcc.quat_inject_scale) > 0.005 ? "#6bf" : "#f88", fontWeight: 600 }}>
                  {status.qcc.quat_inject_scale.toFixed(4)}
                </span>
              </div>
            )}
            {status.qcc.quat_inject_norm !== undefined && (
              <div style={{ color: "#888" }}>
                proj_norm {status.qcc.quat_inject_norm.toFixed(4)}
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
            qcc_scale: aux head gate (init 0). quat_inject_scale: post-Mamba quat residual gate (init 0). blue = used.
          </div>
        </section>
      )}

      <section style={{ padding: "10px 16px", borderTop: "1px solid #252525", flexShrink: 0 }}>
        <a
          href="/notes"
          style={{
            display: "block",
            textAlign: "center",
            color: "#9ca3af",
            textDecoration: "none",
            fontSize: 12,
            padding: "8px 12px",
            border: "1px solid #1f2937",
            borderRadius: 6,
            background: "#0f141b",
          }}
        >
          notes →
        </a>
      </section>
    </main>
  );
}
