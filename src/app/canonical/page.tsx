export const dynamic = "force-static";

const gifs = Array.from({ length: 12 }, (_, i) => {
  const id = String(i).padStart(2, "0");
  return {
    src: `/canonical_sample_${id}_class${id}.gif`,
    label: `class ${i}`,
  };
});

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
      <header style={{ maxWidth: 1400, margin: "0 auto 24px" }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>
          AE canonical-correspondence check · 12 gestures
        </h1>
        <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>
          Per panel — left: raw NVGesture point cloud (random per-frame
          sub-sample, no correspondence across frames). Right: AE decoder
          output of K=512 canonical points, each output index colored
          consistently across all 32 frames. If correspondence holds, each
          color visually tracks a hand region as the gesture progresses;
          if it doesn&apos;t, colors wander randomly. Same AE weights
          applied to every sample — no per-class fine-tuning.
        </p>
      </header>

      <section
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
        }}
      >
        {gifs.map((g) => (
          <figure
            key={g.src}
            style={{
              margin: 0,
              background: "#0f141b",
              border: "1px solid #1f2937",
              borderRadius: 8,
              padding: 10,
            }}
          >
            <figcaption
              style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}
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
          maxWidth: 1400,
          margin: "32px auto 0",
          fontSize: 12,
          color: "#6b7280",
        }}
      >
        AE architecture: per-point MLP encoder (no max-pool bottleneck) +
        learnable-query cross-attention decoder. The K query embeddings
        are shared across frames and samples — index k asks the same
        question every time, which makes correspondence emerge from the
        chamfer + temporal-smoothness training objective.
      </footer>
    </main>
  );
}
