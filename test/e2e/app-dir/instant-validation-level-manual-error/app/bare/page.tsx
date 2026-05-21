// Bare page (no `unstable_instant` config). Under 'experimental-manual-error',
// implicit validation does NOT fire — only segments that explicitly opt in
// are validated. The runtime data accessed at the top of the page would be
// a "Suspense too high for instant navigation" violation if validation were
// running, but in manual mode it goes unflagged. The root layout's Suspense
// satisfies static-shell validation, so no errors surface.
import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <main>
      <p>bare page (no unstable_instant), runtime data at the top.</p>
    </main>
  )
}
