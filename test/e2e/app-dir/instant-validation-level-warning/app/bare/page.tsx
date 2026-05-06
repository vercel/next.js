// Bare page (no `unstable_instant` config). Under 'warning', implicit
// validation fires on this page in dev (and only in dev — warning
// is dev-only). The runtime data accessed at the top of the page is the
// "Suspense too high for instant navigation" violation that instant
// validation specifically flags. The root layout's Suspense satisfies
// static-shell validation, so the only error in dev is the instant one.
import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <main>
      <p>bare page (no unstable_instant), runtime data at the top.</p>
    </main>
  )
}
