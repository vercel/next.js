// Inner layout intentionally drops its plain `{children}` so the inner
// page (configured for instant validation) never renders. This is not a
// fork — there is no sibling slot to render instead — so the configured
// page below is still considered for validation and the route reports
// "could not validate".
export default function Layout() {
  return <p>Children intentionally hidden to test unrendered segments.</p>
}
