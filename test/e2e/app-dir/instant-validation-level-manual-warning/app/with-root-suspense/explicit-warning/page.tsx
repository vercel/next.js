// Same violation as `bare/page.tsx`, but with `unstable_instant = { level:
// 'warning' }`. Explicit warning-level opt-in: validation fires in dev
// only, build is a no-op.
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
