// No `unstable_instant` config on this page, but the page accesses runtime
// data at the top — a "Suspense too high" pattern that instant validation
// specifically flags. Under 'manual-warning', instant validation only
// runs on segments that opt in, so the violation goes unflagged here.
// The root layout's Suspense boundary catches it for cacheComponents'
// static-shell purposes.
import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <main>
      <p>bare page (no unstable_instant), runtime data at the top.</p>
    </main>
  )
}
