import PointCloudViz from "@/components/PointCloudViz";
import CycleDiagram from "@/components/CycleDiagram";
import ResultsCharts from "@/components/ResultsCharts";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import ArticulatedResults from "@/components/ArticulatedResults";
import PmambaRealSamples from "@/components/PmambaRealSamples";

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
          <a href="#pmamba" className="shrink-0 hover:text-[var(--foreground)]">3b. PMamba Samples</a>
          <a href="#arch" className="shrink-0 hover:text-[var(--foreground)]">4. Architecture</a>
          <a href="#results" className="shrink-0 hover:text-[var(--foreground)]">5. Rotation Results</a>
          <a href="#artdata" className="shrink-0 hover:text-[var(--foreground)]">5b. Articulated Data</a>
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
            64 points (32 palm + 32 fingers), 16 frames, Gaussian noise (&sigma;=0.1), 20%
            point occlusion. Best-case scenario for QCC.
          </p>
          <PointCloudViz />
          <p className="mt-3 mb-6 text-xs text-[var(--muted)]">
            Gray = palm points, colored = finger points. Each panel animates one rotation pattern.
          </p>

          <details className="rounded border border-[var(--card-border)]">
            <summary className="cursor-pointer bg-[var(--card)] px-4 py-2 text-sm font-medium">
              Generation code
            </summary>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-[var(--muted)]">{`def generate_rotation_dataset(n_samples_per_class=80, n_points=64,
                               n_frames=16, noise_std=0.1,
                               occlusion_rate=0.2, device='cuda'):
    n_classes = 8
    t = torch.linspace(0, 2 * np.pi, n_frames, device=device)

    patterns = [
        lambda t: torch.zeros_like(t),                        # 0: Static
        lambda t: t * 0.3,                                    # 1: Slow +
        lambda t: t * 1.0,                                    # 2: Fast +
        lambda t: -t * 0.3,                                   # 3: Slow -
        lambda t: -t * 1.0,                                   # 4: Fast -
        lambda t: torch.sin(t * 2) * 0.5,                     # 5: Slow Osc
        lambda t: torch.sin(t * 4) * 0.25,                    # 6: Fast Osc
        lambda t: torch.where(t > np.pi,                      # 7: Step
                    (t - np.pi) * 0.5, torch.zeros_like(t)),
    ]

    for cls_idx, rot_fn in enumerate(patterns):
        angles = rot_fn(t)
        for _ in range(n_samples_per_class):
            palm = torch.randn(n_points // 2, 3) * 0.1
            palm[:, 2] = 0
            fingers = torch.randn(n_points // 2, 3) * 0.05
            fingers[:, 1] = torch.abs(fingers[:, 1]) + 0.2
            base = torch.cat([palm, fingers], dim=0)

            traj = torch.stack([torch.cos(t)*0.3,
                                torch.sin(t)*0.3,
                                torch.zeros_like(t)], dim=-1)

            for f in range(n_frames):
                a = angles[f]
                R = rot_z(a)  # 2D rotation matrix
                pts = base @ R.T + traj[f]
                pts += torch.randn_like(pts) * noise_std
                # 20% occlusion: replace with background noise
                mask = torch.rand(n_points) > occlusion_rate
                pts = torch.where(mask[...,None], pts,
                                  torch.randn(n_points, 3) * 0.3)
                pts = pts[torch.randperm(n_points)]  # shuffle`}</pre>
          </details>
        </Section>

        {/* 2. QCC v3 */}
        <Section id="qcc" num="2" title="QCC v3 Method">
          <div className="flex flex-col gap-5">
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              QCC v3 is a self-supervised regularization loss for geometrically consistent
              rotation representations. It uses pure cycle consistency on quaternion
              compositions &mdash; no direct quaternion supervision.
            </p>

            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div className="rounded border border-[var(--card-border)] bg-[var(--card)] p-3">
                <div className="mb-1 font-medium text-[var(--accent)]">Core Idea</div>
                <p className="leading-relaxed text-[var(--muted)]">
                  Rotate A&rarr;B&rarr;C with predicted quaternions, close the cycle with
                  ground-truth C&rarr;A. The result should be identity. Deviation = cycle error.
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

        <Section id="pmamba" num="3b" title="Real PMamba Train/Test Clips">
          <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
            These are actual clips from the PMamba Nvidia processed dataset. Each card
            compares the original point sequence against the current cycle augmentation
            path so the point-level effect is visible on real train and test samples.
          </p>
          <PmambaRealSamples />
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

        {/* Articulated dataset generation code (between the two experiment sections) */}
        <Section id="artdata" num="5b" title="Articulated Synthetic Dataset Design">
          <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
            A harder dataset with 4 independently moving body regions (palm, thumb, index,
            other fingers). 8 gesture classes span rotation-heavy, translation-heavy, and
            articulation-heavy motions. 480 train / 120 test samples, 16 frames &times; 64
            points &times; 3D.
          </p>

          <details className="rounded border border-[var(--card-border)]" open>
            <summary className="cursor-pointer bg-[var(--card)] px-4 py-2 text-sm font-medium">
              Generation code
            </summary>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-[var(--muted)]">{`def generate_articulated_dataset(n_samples_per_class=60, n_points=64,
                                  n_frames=16, noise_std=0.12,
                                  occlusion_rate=0.2, device='cuda'):
    n_per_region = n_points // 4   # 16 pts each
    t_arr = np.linspace(0, 1, n_frames)

    for cls_idx in range(8):
        for _ in range(n_samples_per_class):
            # 4 regions: Gaussian clouds at fixed offsets
            palm   = randn(16,3)*0.08;  palm[:,2]  *= 0.3
            thumb  = randn(16,3)*0.04;  thumb[:,0] += 0.15; thumb[:,1] += 0.10
            index  = randn(16,3)*0.03;  index[:,1] += 0.25
            others = randn(16,3)*0.04;  others[:,0]-= 0.05; others[:,1]+= 0.20

            phase = rand() * 0.3          # random phase offset
            speed = 0.8 + rand() * 0.4    # speed variation [0.8, 1.2]

            for f in range(n_frames):
                tf = t_arr[f] * speed + phase

                if cls_idx == 0:   # IDLE: all static
                    pass
                elif cls_idx == 1: # SWIPE: translate X
                    palm[:,0]  += tf * 0.4
                    thumb[:,0] += tf * 0.4 + tf * 0.03
                    index[:,0] += tf * 0.4 + tf * 0.02
                    others[:,0]+= tf * 0.4 - tf * 0.02
                elif cls_idx == 2: # WAVE: oscillate Z-rotation
                    angle = sin(tf * 2*pi) * 0.6
                    R = rot_z(angle)
                    palm, thumb, index, others = [p @ R.T for p in ...]
                elif cls_idx == 3: # POINT: thumb/others curl, index extends
                    thumb = rotate_around_center(thumb, rot_x(tf*1.2))
                    index = rotate_around_center(index, rot_x(-tf*0.3))
                    index[:,1] += tf * 0.1
                    others= rotate_around_center(others, rot_x(tf*1.2))
                elif cls_idx == 4: # GRAB: palm forward, all fingers curl
                    palm[:,1] += tf * 0.1
                    for arr in [thumb, index, others]:
                        arr = rotate_around_center(arr, rot_x(tf*1.0))
                elif cls_idx == 5: # PINCH: thumb toward index
                    thumb[:,0] -= tf*0.1;  thumb[:,1] += tf*0.08
                    index[:,0] += tf*0.05; index[:,1] -= tf*0.05
                elif cls_idx == 6: # OPEN: all fingers extend out
                    palm[:,1] -= tf * 0.08
                    for arr in [thumb, index, others]:
                        arr = rotate_around_center(arr, rot_x(-tf*0.8))
                elif cls_idx == 7: # CIRCLE: circular traj + wrist rotation
                    R = rot_z(tf * pi)
                    for arr in [palm, thumb, index, others]:
                        arr = arr @ R.T
                        arr[:,0] += cos(tf*2*pi)*0.15
                        arr[:,1] += sin(tf*2*pi)*0.15

                pts = concatenate([palm, thumb, index, others])
                pts += randn(64,3) * 0.12     # noise
                mask = rand(64) > 0.2          # 20% occlusion
                pts = where(mask, pts, randn(64,3)*0.3)
                pts = pts[randperm(64)]        # shuffle order`}</pre>
          </details>
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
