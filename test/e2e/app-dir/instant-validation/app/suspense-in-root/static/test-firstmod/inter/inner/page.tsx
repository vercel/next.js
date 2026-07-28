// Config lives here, but test-firstmod/layout.tsx (two levels above)
// drops its plain {children}, so this page never renders. That drop is
// not a fork, so this config is still considered for validation and the
// route reports "could not validate".
export const instant = { level: 'experimental-error' }

export default function Page() {
  return <p>test-firstmod inner page (should not render)</p>
}
