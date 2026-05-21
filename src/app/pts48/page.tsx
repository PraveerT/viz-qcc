export const dynamic = "force-static";

const gifs = Array.from({ length: 6 }, (_, i) => {
  const id = String(i).padStart(2, "0");
  return {
    src: `/pts48_sample_${id}_class${id}.gif`,
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
      <header style={{ maxWidth: 1500, margin: "0 auto 24px" }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>
          What the classifier sees at ep1
        </h1>
        <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>
          Three panels per frame. <strong>Left</strong>: raw NVGesture
          input (N=512). <strong>Middle</strong>: full v2 canonical
          (K=1024 from the frozen AE). <strong>Right</strong>: the 48
          points the classifier sees at ep1 — a random 48-of-512 subset of
          the bake&apos;s first-512 slice (mimics{" "}
          <code>_sample_points</code> with <code>pts_size=48</code>).
          Colors are stable across frames per canonical index, so you can
          watch the per-index correspondence shrink down to the curriculum
          subset.
        </p>
      </header>

      <section
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
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
    </main>
  );
}
