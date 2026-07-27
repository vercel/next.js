// Renders only when the `logged-in` cookie is present (see layout).
// Requires instant navigation: when this branch renders, the layout's
// blocking cookies() read must be reported against this config.
export const instant = { level: 'experimental-error' }

export default function LoggedInPage() {
  return <p>auth-fork — logged-in children page</p>
}
