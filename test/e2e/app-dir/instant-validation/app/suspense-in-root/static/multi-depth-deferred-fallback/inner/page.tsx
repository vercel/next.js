// Inner page configured for instant validation. The parent layout hides
// its plain `{children}` — a non-fork drop, so this segment is still
// considered for validation and the route must deterministically report
// "could not validate". The outer layout above is also configured and
// validates cleanly, exercising the deferred missing-boundary fallback.
export const instant = { level: 'experimental-error' }

export default function Page() {
  return <p>Inner page (should never render in this fixture).</p>
}
