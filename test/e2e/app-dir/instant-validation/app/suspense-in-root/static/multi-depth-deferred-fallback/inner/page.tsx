// Inner page configured for instant validation. The parent layout
// hides `{children}`, so this page never renders — its config is
// vacuous and must not produce any validation error. The outer layout
// above is also configured and validates cleanly.
export const instant = { level: 'experimental-error' }

export default function Page() {
  return <p>Inner page (should never render in this fixture).</p>
}
