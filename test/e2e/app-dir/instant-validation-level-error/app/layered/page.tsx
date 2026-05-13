// Bare page (no `unstable_instant` config) sitting under a layout that
// exports `unstable_instant = false`. Under 'experimental-error', implicit
// validation should still fire for this page in dev AND build — the
// layout's `false` doesn't shield descendants.
import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <main>
      layered: bare page under a layout with `unstable_instant = false`.
    </main>
  )
}
