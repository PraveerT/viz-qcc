import PointCloudViz from "@/components/PointCloudViz";
import CycleDiagram from "@/components/CycleDiagram";
import ResultsCharts from "@/components/ResultsCharts";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";

function Section({
  id,
  label,
  title,
  children,
}: {
  id: string;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 py-16 lg:py-24">
      <div className="mb-8">
        <span className="mb-2 inline-block rounded-full bg-[var(--accent-dim)]/10 px-3 py-1 font-mono text-xs text-[var(--accent)]">
          {label}
        </span>
        <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-[var(--card-border)] bg-[var(--background)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <span className="font-mono text-sm font-bold tracking-tight">
            QCC<span className="text-[var(--accent)]">v3</span>
          </span>
          <div className="hidden gap-6 text-sm text-[var(--muted)] sm:flex">
            <a href="#data" className="transition-colors hover:text-[var(--foreground)]">Data</a>
            <a href="#qcc" className="transition-colors hover:text-[var(--foreground)]">QCC v3</a>
            <a href="#cycle" className="transition-colors hover:text-[var(--foreground)]">Cycle</a>
            <a href="#arch" className="transition-colors hover:text-[var(--foreground)]">Architecture</a>
            <a href="#results" className="transition-colors hover:text-[var(--foreground)]">Results</a>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 pt-20">
        {/* Hero */}
        <section className="flex flex-col items-start gap-6 pb-8 pt-16 lg:pt-24">
          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">
            Quaternion Cycle
            <br />
            <span className="text-[var(--accent)]">Consistency</span> v3
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-[var(--muted)]">
            Paper-faithful cycle consistency regularization for rotation-aware
            point cloud gesture recognition. Visualizing the synthetic dataset,
            algorithm, and benchmark results.
          </p>
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              <span className="font-medium text-[var(--foreground)]">Paper: </span>
              ST-QNet: Quaternion-Based Rotation Equivariance for Dynamic Hand
              Gesture Recognition
              <br />
              <span className="font-medium text-[var(--foreground)]">Venue: </span>
              Submitted to IEEE TPAMI (2025)
              <br />
              <span className="font-medium text-[var(--foreground)]">Equations: </span>
              Implements Eq. 1, 5-10 from the paper
            </p>
          </div>
        </section>

        {/* Section 1: Synthetic Data */}
        <Section id="data" label="01" title="The Synthetic Dataset">
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            8 classes of point cloud sequences where each class differs{" "}
            <strong className="text-[var(--foreground)]">only in rotation pattern</strong>.
            Each sequence has 64 points (32 palm + 32 fingers) over 16 frames
            with Gaussian noise (&sigma;=0.12) and 20% point occlusion. This is
            the best-case scenario for QCC &mdash; if it can&apos;t help here, it
            won&apos;t help on real data.
          </p>
          <PointCloudViz />
          <p className="mt-4 text-center text-xs text-[var(--muted)]">
            Gray = palm points, Colored = finger points. Each canvas animates
            one rotation pattern class.
          </p>
        </Section>

        {/* Section 2: What is QCC v3 */}
        <Section id="qcc" label="02" title="What is QCC v3?">
          <div className="flex flex-col gap-6">
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              QCC v3 is a <strong className="text-[var(--foreground)]">self-supervised regularization loss</strong> that
              encourages the network to learn geometrically consistent rotation
              representations. Unlike QCC v2 (which used direct quaternion
              regression), v3 implements the paper&apos;s actual equations: pure{" "}
              <strong className="text-[var(--foreground)]">cycle consistency</strong> on quaternion
              compositions.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4">
                <div className="mb-2 text-xs font-medium text-[var(--accent)]">
                  Core Idea
                </div>
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  If you rotate A&rarr;B&rarr;C using predicted quaternions, then
                  close the cycle with ground-truth C&rarr;A, the result should
                  be the identity rotation. Any deviation is the cycle error.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4">
                <div className="mb-2 text-xs font-medium text-[#22c55e]">
                  vs QCC v2 (Regression)
                </div>
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  v2 directly supervised q_pred = q_SVD, making cycle/velocity
                  losses redundant. This competed with CE gradients and{" "}
                  <strong className="text-[var(--foreground)]">hurt classification by -1.3%</strong>.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4">
                <div className="mb-2 text-xs font-medium text-[#f97316]">
                  Feature Fusion
                </div>
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  Angular velocity (rotation magnitude per frame) is extracted
                  from predicted quaternions and projected into 4 feature channels
                  that feed the classifier alongside spatial features.
                </p>
              </div>
            </div>

            {/* Key Equations */}
            <div className="mt-4">
              <h3 className="mb-3 text-sm font-medium">Key Equations</h3>
              <div className="flex flex-col gap-3">
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
                  <span className="comment">
                    // Eq 8: Confidence-weighted cycle loss
                  </span>
                  <br />
                  <span className="var">L_cycle</span>{" "}
                  <span className="op">=</span> &Sigma;(
                  <span className="var">&epsilon;</span>{" "}
                  <span className="op">&middot;</span>{" "}
                  <span className="var">w</span>) / &Sigma;
                  <span className="var">w</span>
                  <br />
                  <span className="comment">
                    // where w = &radic;(conf_a &middot; conf_c) from SVD singular
                    values
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

        {/* Section 3: Cycle Consistency */}
        <Section id="cycle" label="03" title="How Cycle Consistency Works">
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            Click each step to see how QCC v3 computes the cycle consistency loss.
            Three anchor frames are sampled from different parts of the sequence,
            and both forward and backward cycles are evaluated.
          </p>
          <CycleDiagram />
        </Section>

        {/* Section 4: Architecture */}
        <Section id="arch" label="04" title="Architecture & Gradient Flow">
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            The quaternion head branches off the shared backbone. Angular velocity
            features flow into the classifier, while QCC loss regularizes the
            quaternion predictions. CE and QCC losses have{" "}
            <strong className="text-[var(--foreground)]">
              separate gradient paths
            </strong>{" "}
            to avoid competition.
          </p>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
            <ArchitectureDiagram />
          </div>
        </Section>

        {/* Section 5: Results */}
        <Section id="results" label="05" title="Benchmark Results">
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            Synthetic 8-class rotation dataset. QCC v3 with end-to-end gradient
            flow (no <code className="rounded bg-[var(--card)] px-1.5 py-0.5 font-mono text-xs">.detach()</code>)
            at &lambda;=0.01 achieves{" "}
            <strong className="text-[#22c55e]">+8.8% mean accuracy</strong> over
            baseline, winning 9 out of 9 trials.
          </p>
          <ResultsCharts />
        </Section>

        {/* Footer */}
        <footer className="border-t border-[var(--card-border)] py-8 text-center text-xs text-[var(--muted)]">
          QCC v3 Visualizer &mdash; Built for ST-QNet research
        </footer>
      </main>
    </div>
  );
}
