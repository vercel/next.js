// Renders only when the `logged-in` cookie is present (see layout and
// slow-client-fork). Requires instant navigation. The build sample
// simulates a logged-out request.
export const instant = {
  level: 'experimental-error',
  unstable_samples: [{ cookies: [{ name: 'logged-in', value: null }] }],
}

export default function LoggedInPage() {
  return <p>slow-client-auth-fork — logged-in children page</p>
}
