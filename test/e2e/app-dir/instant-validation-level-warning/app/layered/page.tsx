// Bare page (no `unstable_instant` config) sitting under a layout that
// exports `unstable_instant = false`. Under 'warning', implicit validation
// should still fire for this page in dev — the layout's `false` doesn't
// shield descendants.
import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <main>
      <p>layered: bare page under a layout with `unstable_instant = false`.</p>
    </main>
  )
}
