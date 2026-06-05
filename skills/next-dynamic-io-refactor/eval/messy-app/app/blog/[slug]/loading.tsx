// ⛔ MESSY: a coarse loading.tsx that suspends the WHOLE blog segment and
// hand-builds a skeleton mirroring the page chrome (title + body + comments).
// Most of this page (the post title/body) can be in the static shell once the
// post read is cached — so a segment-wide loading screen throws shell content
// away and drifts from the real layout. (Fix: lever 5 — delete or shrink this;
// stream only the comments behind a per-region <Suspense> with its own skeleton.)
export default function BlogLoading() {
  return (
    <article>
      <div style={{ height: 32, width: '60%', background: '#eee' }} />
      <div style={{ height: 80, background: '#eee' }} />
      <div style={{ height: 24, width: '30%', background: '#eee' }} />
      <div style={{ height: 60, background: '#eee' }} />
    </article>
  )
}
