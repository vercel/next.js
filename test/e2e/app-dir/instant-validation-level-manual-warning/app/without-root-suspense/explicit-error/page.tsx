// Same shape as bare/page.tsx — runtime data accessed outside a Suspense
// boundary — but with an explicit `unstable_instant = { level: 'experimental-error' }`.
// Even though the validation level is 'manual-warning', the explicit
// per-segment opt-in escalates validation to error level in both dev and
// build, and the violation should fail the build.
import { connection } from 'next/server'

export const unstable_instant = { level: 'experimental-error' as const }

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        explicit-error page (unstable_instant level: experimental-error),
        runtime data at the top.
      </p>
    </main>
  )
}
