// Same violation as `bare/page.tsx`, but with `unstable_instant = true`.
// `true` is "opt in at the framework default level" — under
// 'experimental-error', this resolves to error-level validation.
// Validation fires in dev and build. Same observable behavior as
// `bare/page.tsx`; this case proves the override mechanism works at the
// same level as the configured one.
import { connection } from 'next/server'

export const unstable_instant = true

export default async function Page() {
  await connection()
  return (
    <main>
      <p>explicit-true: opt in at the framework default level.</p>
    </main>
  )
}
