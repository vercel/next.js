// Inner page configured for instant validation. The parent layout
// hides `{children}`, so this page never renders — its boundary will
// never appear in `boundaryState.renderedIds`, producing a missing-
// boundary fallback at the inner depth's iteration of the validation
// loop. The outer layout above is also configured but validates
// cleanly, so the deferred fallback surfaces only at the end.
export const instant = { level: 'experimental-error' }

export default function Page() {
  return <p>Inner page (should never render in this fixture).</p>
}
