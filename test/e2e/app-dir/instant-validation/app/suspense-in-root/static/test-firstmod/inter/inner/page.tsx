// Config lives here, but test-firstmod/layout.tsx (two levels above)
// drops {children}, so this page never renders. Its config is vacuous
// and must not produce any validation error.
export const instant = { level: 'experimental-error' }

export default function Page() {
  return <p>test-firstmod inner page (should not render)</p>
}
