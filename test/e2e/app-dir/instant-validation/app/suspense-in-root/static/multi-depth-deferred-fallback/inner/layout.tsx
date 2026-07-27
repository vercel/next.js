// Inner layout intentionally drops `{children}` so the inner page
// (configured for instant validation) never renders. An unrendered
// segment is vacuous: its config demands nothing and it cannot block
// anything, so this route must validate cleanly.
export default function Layout() {
  return <p>Children intentionally hidden to test unrendered segments.</p>
}
