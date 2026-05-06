// Same violation as `bare/page.tsx`, but with `unstable_instant = { level:
// 'error' }`. Explicit per-segment override at the same level as the
// configured 'experimental-error'. Same observable behavior as
// `bare/page.tsx`; this case proves the override mechanism resolves
// correctly when the explicit value matches the configured level.
import { connection } from 'next/server'

export const unstable_instant = { level: 'experimental-error' as const }

export default async function Page() {
  await connection()
  return (
    <main>
      <p>explicit-error: explicit error-level override.</p>
    </main>
  )
}
