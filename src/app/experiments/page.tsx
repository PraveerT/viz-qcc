"use client";

/* Experiments summary page for supervisor briefing.
 * Path: /experiments
 * Self-contained: no API calls, static content.
 */

const PALETTE = {
  bg: "#0a0a0a",
  card: "#141414",
  border: "#262626",
  text: "#e5e5e5",
  muted: "#9ca3af",
  good: "#6f9",
  bad: "#f87171",
  warn: "#fbbf24",
  accent: "#7aa2ff",
};

const fontMono =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{
        fontSize: 18, color: PALETTE.accent, margin: "0 0 10px 0",
        borderBottom: `1px solid ${PALETTE.border}`, paddingBottom: 6,
      }}>{title}</h2>
      <div style={{ color: PALETTE.text, lineHeight: 1.55, fontSize: 14 }}>{children}</div>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: PALETTE.card, border: `1px solid ${PALETTE.border}`,
      borderRadius: 6, padding: 12, marginBottom: 8,
    }}>{children}</div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre style={{
      background: "#0d1117", color: "#c9d1d9",
      border: `1px solid ${PALETTE.border}`,
      borderRadius: 4, padding: 10, fontSize: 12,
      overflow: "auto", fontFamily: fontMono, margin: "6px 0",
    }}>{children}</pre>
  );
}

function Tbl({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table style={{
      width: "100%", borderCollapse: "collapse",
      fontFamily: fontMono, fontSize: 12, margin: "6px 0",
    }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{
              textAlign: "left", padding: "4px 8px",
              borderBottom: `1px solid ${PALETTE.border}`,
              color: PALETTE.muted, fontWeight: 600,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} style={{
                padding: "3px 8px",
                borderBottom: `1px solid ${PALETTE.border}30`,
              }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Pill({ tone, children }: { tone: "good" | "bad" | "warn" | "muted"; children: React.ReactNode }) {
  const colors = { good: PALETTE.good, bad: PALETTE.bad, warn: PALETTE.warn, muted: PALETTE.muted };
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 3,
      background: `${colors[tone]}22`, color: colors[tone],
      fontFamily: fontMono, fontSize: 11, fontWeight: 600,
    }}>{children}</span>
  );
}

export default function ExperimentsPage() {
  return (
    <main style={{
      background: PALETTE.bg, color: PALETTE.text, minHeight: "100vh",
      padding: "30px 32px", fontFamily: "system-ui, -apple-system, sans-serif",
      maxWidth: 980, margin: "0 auto",
    }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px 0", color: "#fff" }}>
          NVGesture Architectural Investigation
        </h1>
        <div style={{ color: PALETTE.muted, fontSize: 13 }}>
          Summary of architectural experiments + frozen-mechanism diagnostic. May 2026.
        </div>
      </header>

      <Section title="0. Setup">
        <ul style={{ paddingLeft: 18 }}>
          <li><b>Dataset:</b> NVGesture — 1,532 dynamic hand-gesture point-cloud sequences, 25 classes; 1,050 train / 482 test (subject-independent).</li>
          <li><b>Base architecture (PMamba):</b> 4-stage hierarchical point-cloud sequence model.</li>
          <li><b>Honest train-best protocol:</b> pick checkpoint by highest training accuracy, eval once. No test-set epoch selection.</li>
          <li><b>Baseline anchor:</b> original PMamba ep115 = <Pill tone="good">90.04%</Pill> test acc with the Mamba temporal encoder.</li>
        </ul>

        <Card>
          <div style={{ fontSize: 13, color: PALETTE.muted, marginBottom: 4 }}>PMamba 4-stage architecture (compact)</div>
          <Code>{`input (B, T=32, N_raw, 4 coords)
  └─ _sample_points → (B, 4, T, pts_size)

Stage 1 (intra-frame)
  └─ group.group_points  k=32
  └─ MLPBlock [4 → 32 → 64]
  └─ AdaptiveMaxPool2d (over k-NN)

Stage 2 (inter-frame)
  └─ MultiScaleFeatureProcessor (scales {2,4,8,16,32})
  └─ st_group_points  k=24
  └─ MotionBlock [128 → 128]
  └─ AdaptiveMaxPool2d  → ↓2 points

Stage 3 (spatial + temporal encoder)
  └─ st_group_points  k=48
  └─ MotionBlock [256 → 256]
  └─ AdaptiveMaxPool2d → fea3 (B, 256, T, N)
  └─ self.mamba = MambaTemporalEncoder        ← the load-bearing slot we tested
        input_proj 256→128
        [LayerNorm → Mamba layer → +residual] × 2  (bidirectional)
        final_norm
        output_proj 128→256

Stage 4 (classifier)
  └─ cat(coords, fea3_mamba) → MLP[260→1024]
  └─ AdaptiveMaxPool2d(1,1)
  └─ BatchNorm2d → MLP[1024→25] → logits`}</Code>
        </Card>
      </Section>

      <Section title="1. Architectural variants explored — all targeted the Stage-3 temporal encoder slot">
        <p>
          Six different temporal mechanisms were swapped into <code style={{fontFamily:fontMono}}>self.mamba</code>,
          training from scratch with the rest of the network frozen-architecture (k-NN sizes, channel widths, classifier head, schedule all identical).
        </p>
        <Tbl
          headers={["Variant", "Mechanism", "Encoder params", "Test acc (best)", "Train-best ep"]}
          rows={[
            ["Mamba (baseline)", "Selective SSM (Gu 2023)", "0.115M", "90.04", "115"],
            ["RealDeltaNet (RD)", "Delta rule + 4-fold quaternion-shape", "0.29M", "90.46 / 88.59", "118"],
            ["AttRD", "RD + softmax read over states", "~0.30M", "89.63 / 89.00", "120"],
            ["BDN-Q", "FIFO buffer + delta eject", "0.23M", "89.00 / 87.76", "108"],
            ["Lie-group", "SO(3) state, Hamilton-product recurrence", "0.19M", "89.42", "109"],
            ["CSTA", "Causal ST attention + RBF time-bias", "0.42M", "89.63", "109"],
            ["Mamba2", "Mamba2 SSD", "~0.8M", "88.80", "—"],
          ]}
        />
        <p style={{ color: PALETTE.muted, fontSize: 13 }}>
          All variants land in 87.76–90.46 (≤2.7pp spread) despite radically different mechanisms.
          The convergence to a narrow band was the first red flag.
        </p>
      </Section>

      <Section title="2. The frozen-mechanism diagnostic">
        <p>
          For each trained checkpoint, we override the temporal block&apos;s forward pass at <i>inference time</i> to
          produce a no-op output, leaving the rest of the network and its trained weights intact. If the
          model&apos;s predictions change → the block was contributing. If they stay identical → the
          residual carries the spatial signal around the block.
        </p>
        <Code>{`# Pseudo-code applied to each architecture
def patched_block_forward(self, x):
    return torch.zeros_like(x)   # block emits 0; residual stack does the work

BlockClass.forward = patched_block_forward
load trained checkpoint
acc = eval(test_set)
# Compare against acc with the original forward`}</Code>
        <Tbl
          headers={["Variant", "Normal", "Block→0", "Δ", "Verdict"]}
          rows={[
            ["Mamba", "90.04 (434/482)", "90.04 (434/482)", "+0.00 pp", "decorative"],
            ["RealDeltaNet", "88.59", "88.59", "+0.00 pp", "decorative"],
            ["AttRD (attn pattern → any)", "89.00", "89.00", "+0.00 pp", "decorative"],
            ["BDN-Q (block out = 0)", "87.76", "87.76", "+0.00 pp", "decorative"],
            ["Lie-group (ω → 0, state = identity)", "89.42", "89.42", "+0.00 pp", "decorative"],
          ]}
        />
        <p>
          <b>Every Stage-3 temporal mechanism we tested is bypassed at inference.</b> Predictions are
          produced identically when the block output is zeroed — the residual connection inside the
          encoder routes the spatial features around the block. The 2.7pp spread across architectures
          is a training-dynamics artefact, not a mechanism contribution.
        </p>
      </Section>

      <Section title="3. Decomposing the encoder — what is load-bearing">
        <p>
          The Mamba encoder also has an input/output projection wrapping the Mamba layers. We tested
          replacing the entire encoder with the identity (full passthrough) to isolate which part
          carries signal.
        </p>
        <Tbl
          headers={["Configuration", "Test acc", "Δ vs Mamba"]}
          rows={[
            ["Normal Mamba encoder", "90.04", "—"],
            ["Mamba layers → 0 (in/out QuaternionLinear active)", "90.04", "+0.00 pp"],
            ["Entire encoder → identity (no projections at all)", "5.19", "−84.85 pp"],
          ]}
        />
        <p>
          <b>The Mamba layers contribute 0 pp; the in/out QuaternionLinear projections carry +84.85 pp.</b>
          The &quot;temporal encoder&quot; is doing nothing temporal — only the per-frame channel
          bottleneck transformation matters.
        </p>
      </Section>

      <Section title="4. CN family — cleanest minimal architectures">
        <p>
          Built CN as the no-temporal-mixing baseline: replace the whole MambaTemporalEncoder with a
          per-frame Linear→LN→Linear bottleneck. Then progressively scaled to test the
          parameter-count hypothesis.
        </p>
        <Tbl
          headers={["Variant", "Encoder params", "ep10", "ep20", "ep40", "Best"]}
          rows={[
            ["CN (Linear bottleneck)", "0.066M", "70.95", "80.5", "83.8", "83.82 @ ep40"],
            ["CN-XL (wider Linear)", "0.33M", "79.9", "82.2", "—", "killed @ ep14"],
            ["CN-XXL (wider × deeper)", "2.24M", "77.2", "84.0", "85.3", "89.00 @ ep103"],
            ["RD (delta rule)", "0.29M", "80.3", "81.7", "85.3", "90.46"],
            ["PMamba (Mamba)", "0.115M", "70.5", "82.0", "87.3", "90.04"],
          ]}
        />
        <Card>
          <b>CN-XXL achieves 89.00% with zero temporal mixing</b> — just a wider per-frame MLP
          in the Stage-3 slot. The 5-6pp gap between CN (0.066M, 83.82) and CN-XXL (2.24M, 89.00) is
          purely a parameter-budget effect on the spatial pipeline&apos;s training dynamics, not from any
          temporal mechanism.
        </Card>
        <p style={{ fontSize: 13, color: PALETTE.muted }}>
          <b>Calibrated cluster threshold:</b> ~0.2–0.3M params in the Stage-3 slot is enough to lift
          ep10 acc from ~70 (no-encoder cluster) to ~80 (rich-encoder cluster). Mechanism is
          irrelevant; only param budget matters at this stage.
        </p>
      </Section>

      <Section title="5. Auxiliary-loss attempts (current path)">
        <p>
          Since architecture mods are bypassed by residual, we shift to auxiliary losses that
          provide gradient signal directly to features. These can&apos;t be bypassed because they
          are losses, not forward computations.
        </p>
        <Tbl
          headers={["Direction", "Mechanism", "Result"]}
          rows={[
            ["A2 — Quaternion Pose-Trajectory Pool", "Stage 4 pool predicts per-frame quaternion; aggregate via quat-aware stats", "88.38 @ ep19 (below CN-XXL 89.00)"],
            ["B2 — Quaternion Multi-Scale Conv (Parcollet)", "Stage 2 scale_filters → Hamilton-product convs", "fail (killed mid-train)"],
            ["Direction 2 — REQNN Stage 1 (Shen 2024 style)", "Stage 1 MLPBlock → quaternion-MLP", "fail (slow climb, < baseline)"],
            ["A′ — Global Frame-Feature Cycle Loss", "‖Δ_ab + Δ_bc − Δ_ac‖² on global per-frame features", "trivial-zero collapse → uninformative"],
            ["A″ — Future Feature Prediction (running)", "predict f_{t+k} from f_t; detached target", "training in progress"],
          ]}
        />
      </Section>

      <Section title="6. Fusion ceiling (separate from the architectural finding)">
        <p>
          Uniform 1/K ensemble across 5 different PMamba-family solos + the CVPR I3DWTrans depth
          stream reaches <Pill tone="good">92.53%</Pill>, honest train-best epoch selection. The lift comes from:
        </p>
        <ul style={{ paddingLeft: 18 }}>
          <li>+1.66 from <b>multi-modal</b> (depth + point cloud); DSN alone = 90.25.</li>
          <li>+0.62 from <b>ensemble variance</b>: different decorative blocks → different training dynamics → slightly different spatial-pipeline weights → uniform 1/K averaging reduces correlated noise.</li>
        </ul>
        <Tbl
          headers={["Combo", "Acc"]}
          rows={[
            ["DSN solo (depth CNN)", "90.25"],
            ["DSN + AttRD (2-way)", "91.91"],
            ["DSN + AttRD + DN2 (3-way)", "92.32"],
            ["DSN + RD + BRD(N2) + AttRD + DN2 (5-way)", "92.53"],
          ]}
        />
      </Section>

      <Section title="7. What this means for the paper">
        <Card>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>Stage-3 temporal mechanism is not the publishable contribution — it&apos;s decorative on this backbone.</li>
            <li>The 90.04 baseline is driven by the spatial pipeline + Stage-3 channel bottleneck, not by Mamba.</li>
            <li>Stage 2 multi_scale also has a final residual (<code style={{fontFamily:fontMono}}>return output + x</code>) — any quaternion conv there is also bypassable.</li>
            <li>Stage 4 max-pool already extracts the right summary statistics; a quaternion replacement (A2) didn&apos;t add value.</li>
            <li>The genuinely <b>main-path unbypassable</b> components are: Stage 1 MLP (small param budget there), <code style={{fontFamily:fontMono}}>pool1/2/3</code> k-NN aggregators, classifier head — and <b>auxiliary losses</b> (the current path).</li>
          </ul>
        </Card>
      </Section>

      <Section title="8. Diagnostic methodology — the actual research output">
        <p>
          Each architecture got a <i>frozen-output diagnostic</i> applied to its trained checkpoint. The diagnostic is
          architecture-specific but uniformly structured:
        </p>
        <Code>{`# Lie-group state recurrence
def patched_block_forward(self, x):
    # Freeze state at identity (q = [1, 0, 0, 0]), skip Hamilton update
    return zero_state_passthrough(x)

# AttRD attention-read
attn = torch.eye(T)               # identity attention = standard RD point read
# uniform attn = state averaging
# either gives the same predictions as softmax → attention is decorative

# BDN-Q buffer eject
def patched_block_forward(self, x):
    return torch.zeros_like(block_output)   # entire block output → 0
# residual still carries spatial signal

# Mamba SSM
Mamba.forward = lambda self, x: torch.zeros_like(x)
# residual carries signal in the MambaTemporalEncoder._stack`}</Code>
        <p>
          Every diagnostic recovers <Pill tone="bad">+0.00 pp</Pill> delta. <b>The methodology — apply a no-op
          patch to the suspected mechanism at inference, compare predictions — generalizes broadly</b>
          and can be applied to any architecture paper to verify the proposed component is doing real work.
        </p>
      </Section>

      <Section title="9. Current direction (running)">
        <p>
          <b>Future Feature Prediction</b> (Direction A″): aggregate Stage-3 features per frame to a global
          vector via attention pool, then predict <code style={{fontFamily:fontMono}}>f_{`{t+k}`}</code> from <code style={{fontFamily:fontMono}}>f_t</code>
          using a learned transition MLP. Auxiliary MSE loss with detached target so there&apos;s no trivial-zero
          collapse (unlike A′ feature cycle which converged to Δ ≈ 0).
        </p>
        <Code>{`# FutureFeaturePredictor.loss
f = attn_pool(fea3)                      # (B, T, C)  per-frame global feature
e = embed(f)                              # (B, T, embed)
for h in (1, 2, 4):                        # multi-horizon
    pred = transition_step(e, k=h)        # (B, T-h, embed)
    tgt  = e[:, h:].detach()              # detached so target is real
    loss += MSE(pred, tgt)`}</Code>
        <p>
          Resumes from CN-XXL ep100. 30 epochs of fine-tune: 10 at base LR (1.2e-4), 20 at 1/10 LR.
          Goal: lift CN-XXL&apos;s 89.00 toward 90.46+.
        </p>
      </Section>

      <footer style={{
        marginTop: 32, paddingTop: 12,
        borderTop: `1px solid ${PALETTE.border}`,
        fontSize: 12, color: PALETTE.muted,
      }}>
        Repo: <code style={{fontFamily:fontMono}}>worktree-qhdelta-fuse</code> on Anemon project.
        Reproducible diagnostics in <code style={{fontFamily:fontMono}}>diagnose_*_frozen.py</code>.
        Numbers as of May 18 2026.
      </footer>
    </main>
  );
}
