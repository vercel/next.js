// Renders only when the `logged-in` cookie is absent (see layout and
// slow-client-fork). Explicitly allowed to block.
export const instant = false

export default function LoginPage() {
  return <p>slow-client-auth-fork — logged-out login page</p>
}
