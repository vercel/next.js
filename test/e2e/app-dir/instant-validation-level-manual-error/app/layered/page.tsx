// Bare page (no `unstable_instant` config) sitting under a layout that
// exports `unstable_instant = false`. Under 'experimental-manual-error',
// no implicit validation runs — the bare descendant has no explicit
// opt-in, and the layout's `false` is a per-segment no-op for descendants.
import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <main>
      layered: bare page under a layout with `unstable_instant = false`.
    </main>
  )
}
