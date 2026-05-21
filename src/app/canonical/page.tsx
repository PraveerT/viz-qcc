export const dynamic = "force-static";

const gifs = [
  { src: "/canonical_sample_0_class0.gif", label: "sample 0 · class 0" },
  { src: "/canonical_sample_1_class4.gif", label: "sample 1 · class 4" },
  { src: "/canonical_sample_2_class12.gif", label: "sample 2 · class 12" },
];

export default function Page() {
  return (
    <main
      style={{
        background: "#0b0f14",
        color: "#e5e7eb",
        minHeight: "100vh",
        padding: "32px 24px",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <header style={{ maxWidth: 980, margin: "0 auto 24px" }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>
          AE canonical-correspondence check
        </h1>
        <p style={{ fontSize: 14, color: "#9ca3af", marginTop: 8 }}>
          Left: raw NVGesture point cloud (random per-frame sub-sample, no
          correspondence across frames). Right: AE decoder output of K=128
          canonical points, each output index colored consistently across
          frames. If correspondence holds, each color visually tracks a
          hand region as the gesture progresses; if it doesn&apos;t, colors
          wander randomly.
        </p>
      </header>

      <section
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 18,
        }}
      >
        {gifs.map((g) => (
          <figure
            key={g.src}
            style={{
              margin: 0,
              background: "#0f141b",
              border: "1px solid #1f2937",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <figcaption
              style={{ fontSize: 13, color: "#9ca3af", marginBottom: 8 }}
            >
              {g.label}
            </figcaption>
            <img
              src={g.src}
              alt={g.label}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </figure>
        ))}
      </section>

      <footer
        style={{
          maxWidth: 980,
          margin: "32px auto 0",
          fontSize: 12,
          color: "#6b7280",
        }}
      >
        Generated from <code>work_dir/ae_pretrain/ae_pretrain.pt</code> on
        the NVGesture test split (self-supervised pretrain only; no
        classifier signal). Loss = chamfer + 0.5·temporal smoothness, 30
        epochs.
      </footer>
    </main>
  );
}
