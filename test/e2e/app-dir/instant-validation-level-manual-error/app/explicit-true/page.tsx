// Same violation as `bare/page.tsx`, but with `unstable_instant = true`.
// `true` is "opt in at the framework default level" — under
// 'experimental-manual-error', this resolves to error-level validation.
// Validation fires in dev and build. Unlike `bare/page.tsx` (which is
// skipped in manual mode), the explicit opt-in here pulls this page into
// validation.
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
