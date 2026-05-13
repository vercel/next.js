// Same violation as `bare/page.tsx`, but with `unstable_instant = { level:
// 'warning' }`. Explicit per-segment override at the same level as the
// configured 'warning'. Same observable behavior as `bare/page.tsx`; this
// case proves the override mechanism resolves correctly when the explicit
// value matches the configured level.
import { connection } from 'next/server'

export const unstable_instant = { level: 'warning' as const }

export default async function Page() {
  await connection()
  return (
    <main>
      <p>explicit-warning: explicit warning-level override.</p>
    </main>
  )
}
