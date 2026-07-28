// Renders only when the `logged-in` cookie is present (see layout and
// client-fork). Requires instant navigation: when this branch renders,
// the layout's blocking cookies() read must be reported against this
// config. The build sample simulates a logged-out request.
export const instant = {
  level: 'experimental-error',
  unstable_samples: [{ cookies: [{ name: 'logged-in', value: null }] }],
}

export default function LoggedInPage() {
  return <p>client-auth-fork — logged-in children page</p>
}
