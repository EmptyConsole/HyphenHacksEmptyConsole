export default function ComingSoon({ title }: { title: string }) {
  return (
    <main
      className="container"
      style={{ minHeight: "100dvh", display: "grid", placeContent: "center", textAlign: "center", gap: "var(--space-4)" }}
    >
      <p className="eyebrow">Coming soon</p>
      <h1 style={{ fontSize: "var(--text-h1)", letterSpacing: "var(--tracking-heading)", lineHeight: "var(--leading-snug)" }}>
        {title}
      </h1>
    </main>
  );
}
