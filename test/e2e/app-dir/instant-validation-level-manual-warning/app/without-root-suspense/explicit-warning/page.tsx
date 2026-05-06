// Same violation as `bare/page.tsx`, but with `unstable_instant = { level:
// 'warning' }`. Explicit warning-level opt-in: instant validation fires
// in dev (and takes priority over the static-shell error since instant
// is active); build does not validate.
import { connection } from 'next/server'

export const unstable_instant = { level: 'warning' as const }

export default async function Page() {
  await connection()
  return (
    <main>
      <p>explicit-warning: explicit warning-level opt-in.</p>
    </main>
  )
}
