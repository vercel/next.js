// Renders only when the `logged-in` cookie is absent (see layout and
// client-fork). Explicitly allowed to block: when this branch renders,
// the layout's blocking cookies() read is acknowledged and must not be
// reported. The sibling children page's error-level config must not
// apply here because that slot never renders — even though it IS
// serialized into the client component's props.
export const instant = false

export default function LoginPage() {
  return <p>client-auth-fork — logged-out login page</p>
}
