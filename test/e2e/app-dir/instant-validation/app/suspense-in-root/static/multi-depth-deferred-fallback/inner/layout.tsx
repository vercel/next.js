// Inner layout intentionally drops `{children}` so the inner page
// boundary (configured for instant validation) cannot render. This
// produces a missing-boundary fallback at the inner depth's iteration
// of the validation loop.
export default function Layout() {
  return <p>Children intentionally hidden to test multi-depth deferral.</p>
}
