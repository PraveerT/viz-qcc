import PointCloudViz from "@/components/PointCloudViz";
import CycleDiagram from "@/components/CycleDiagram";
import ResultsCharts from "@/components/ResultsCharts";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import ArticulatedResults from "@/components/ArticulatedResults";

function Section({
  id,
  num,
  title,
  children,
}: {
  id: string;
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-[var(--card-border)] pt-6 pb-10">
      <h2 className="mb-4 text-lg font-semibold">
        {num}. {title}
      </h2>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <nav className="sticky top-0 z-50 w-full border-b border-[var(--card-border)] bg-[var(--background)]">
        <div className="mx-auto flex max-w-4xl items-center gap-6 overflow-x-auto px-6 py-2 text-xs text-[var(--muted)]">
          <a href="#data" className="shrink-0 hover:text-[var(--foreground)]">1. Rotation Data</a>
          <a href="#qcc" className="shrink-0 hover:text-[var(--foreground)]">2. QCC v3</a>
          <a href="#cycle" className="shrink-0 hover:text-[var(--foreground)]">3. Cycle</a>
          <a href="#arch" className="shrink-0 hover:text-[var(--foreground)]">4. Architecture</a>
          <a href="#results" className="shrink-0 hover:text-[var(--foreground)]">5. Rotation Results</a>
          <a href="#articulated" className="shrink-0 hover:text-[var(--foreground)]">6. Articulated Results</a>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 pt-10">
        {/* Title block */}
        <header className="mb-10">
          <h1 className="text-xl font-bold leading-tight">
            QCC v3: Quaternion Cycle Consistency for Point Cloud Gesture Recognition
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Synthetic ablation report &mdash; ST-QNet (IEEE TPAMI 2025)
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
            This page documents two synthetic experiments testing QCC v3: (1) a rotation-only
            dataset where classes differ solely in rotation pattern, and (2) an articulated
            dataset with independently moving hand regions. QCC v3 implements Eq. 1, 5-10
            from the paper &mdash; pure cycle consistency with no direct quaternion supervision.
          </p>
        </header>

        {/* 1. Synthetic Data */}
        <Section id="data" num="1" title="Rotation-Only Synthetic Dataset">
          <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
            8 classes of point cloud sequences where each class differs only in rotation pattern.
            64 points (32 palm + 32 fingers), 16 frames, Gaussian noise (&sigma;=0.12), 20%
            point occlusion. Best-case scenario for QCC.
          </p>
          <PointCloudViz />
          <p className="mt-3 text-xs text-[var(--muted)]">
            Gray = palm points, colored = finger points. Each panel animates one rotation pattern.
          </p>
        </Section>

        {/* 2. QCC v3 */}
        <Section id="qcc" num="2" title="QCC v3 Method">
          <div className="flex flex-col gap-5">
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              QCC v3 is a self-supervised regularization loss for geometrically consistent
              rotation representations. Unlike QCC v2 (direct quaternion regression, which
              hurt classification by &minus;1.3%), v3 uses pure cycle consistency on quaternion
              compositions.
            </p>

            <div className="grid gap-3 text-xs sm:grid-cols-3">
              <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-3">
                <div className="mb-1 font-medium text-[var(--accent)]">Core Idea</div>
                <p className="leading-relaxed text-[var(--muted)]">
                  Rotate A&rarr;B&rarr;C with predicted quaternions, close the cycle with
                  ground-truth C&rarr;A. The result should be identity. Deviation = cycle error.
                </p>
              </div>
              <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-3">
                <div className="mb-1 font-medium text-[var(--green)]">vs QCC v2</div>
                <p className="leading-relaxed text-[var(--muted)]">
                  v2 directly supervised q_pred = q_SVD, making cycle/velocity losses redundant.
                  Competed with CE gradients and hurt classification.
                </p>
              </div>
              <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-3">
                <div className="mb-1 font-medium text-[var(--orange)]">Feature Fusion</div>
                <p className="leading-relaxed text-[var(--muted)]">
                  Angular velocity from predicted quaternions is projected to 4 channels
                  and concatenated with spatial features before the classifier.
                </p>
              </div>
            </div>

            <div className="mt-2">
              <h3 className="mb-2 text-sm font-medium">Key Equations</h3>
              <div className="flex flex-col gap-2">
                <div className="eq">
                  <span className="comment">// Eq 1: Geodesic distance on S&sup3;</span>
                  <br />
                  <span className="fn">d</span>(
                  <span className="var">q&sub1;</span>,{" "}
                  <span className="var">q&sub2;</span>) <span className="op">=</span>{" "}
                  2 <span className="op">&middot;</span>{" "}
                  <span className="fn">arccos</span>(|&langle;
                  <span className="var">q&sub1;</span>,{" "}
                  <span className="var">q&sub2;</span>&rangle;|)
                </div>
                <div className="eq">
                  <span className="comment">// Eq 5: Forward cycle composition</span>
                  <br />
                  <span className="var">q_pred</span>(A&rarr;C){" "}
                  <span className="op">=</span>{" "}
                  <span className="var">q_pred</span>(B&rarr;C){" "}
                  <span className="op">&otimes;</span>{" "}
                  <span className="var">q_pred</span>(A&rarr;B)
                  <br />
                  <span className="var">q_cycle</span>{" "}
                  <span className="op">=</span>{" "}
                  <span className="var">q_pred</span>(A&rarr;C){" "}
                  <span className="op">&otimes;</span>{" "}
                  <span className="var">q_gt</span>(C&rarr;A){" "}
                  <span className="op">&asymp;</span>{" "}
                  <span className="var">q_identity</span>
                </div>
                <div className="eq">
                  <span className="comment">// Eq 8: Confidence-weighted cycle loss</span>
                  <br />
                  <span className="var">L_cycle</span>{" "}
                  <span className="op">=</span> &Sigma;(
                  <span className="var">&epsilon;</span>{" "}
                  <span className="op">&middot;</span>{" "}
                  <span className="var">w</span>) / &Sigma;
                  <span className="var">w</span>
                  <br />
                  <span className="comment">
                    // where w = &radic;(conf_a &middot; conf_c) from SVD singular values
                  </span>
                </div>
                <div className="eq">
                  <span className="comment">// Eq 10: Total loss</span>
                  <br />
                  <span className="var">L_total</span>{" "}
                  <span className="op">=</span>{" "}
                  <span className="var">L_CE</span>{" "}
                  <span className="op">+</span> &lambda;{" "}
                  <span className="op">&middot;</span> (
                  <span className="var">L_cycle</span>{" "}
                  <span className="op">+</span> &lambda;
                  <sub>unit</sub> <span className="op">&middot;</span>{" "}
                  <span className="var">L_unit</span>)
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* 3. Cycle */}
        <Section id="cycle" num="3" title="Cycle Consistency Procedure">
          <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
            Click each step to see how QCC v3 computes the cycle consistency loss.
            Three anchor frames are sampled from different thirds of the sequence.
          </p>
          <CycleDiagram />
        </Section>

        {/* 4. Architecture */}
        <Section id="arch" num="4" title="Architecture and Gradient Flow">
          <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
            The quaternion head branches off the shared backbone. Angular velocity features
            flow into the classifier via .detach(), while QCC loss regularizes the quaternion
            predictions. CE and QCC losses have separate gradient paths.
          </p>
          <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-4">
            <ArchitectureDiagram />
          </div>
        </Section>

        {/* 5. Rotation Results */}
        <Section id="results" num="5" title="Experiment 1: Rotation-Only Dataset Results">
          <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
            8-class rotation dataset, &lambda;=0.01. QCC v3 achieves +8.8% mean accuracy
            over baseline (30.7% &rarr; 39.4%), winning 9/9 trials.
          </p>
          <ResultsCharts />
        </Section>

        {/* 6. Articulated Results */}
        <Section id="articulated" num="6" title="Experiment 2: Articulated Dataset Results">
          <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
            A harder test with independently moving body regions (fingers curl, wrist
            rotates, palm translates). Classes differ in articulated motion, not just
            global rotation. QCC v3 achieves +3.1% mean accuracy (58.1% &rarr; 61.1%),
            winning 3/3 trials.
          </p>
          <ArticulatedResults />
        </Section>

        {/* Footer */}
        <footer className="border-t border-[var(--card-border)] py-6 text-center text-xs text-[var(--muted)]">
          QCC v3 Ablation Report &mdash; ST-QNet
        </footer>
      </main>
    </div>
  );
}
