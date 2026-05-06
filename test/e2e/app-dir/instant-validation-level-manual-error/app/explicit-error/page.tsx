// Same violation as `bare/page.tsx`, but with `unstable_instant = { level:
// 'error' }`. Explicit per-segment override at the same level as the
// configured 'experimental-manual-error'. Validation fires in dev and
// build. Unlike `bare/page.tsx` (skipped in manual mode), the explicit
// opt-in here pulls this page into validation.
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
