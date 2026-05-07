// Same violation as `bare/page.tsx`, but with `unstable_instant = { level:
// 'warning' }`. Per-segment override lowers the level from the configured
// 'experimental-error' to 'warning', so build validation does not fire and
// the build stays clean even though the violation exists. Dev still shows
// the instant redbox.
import { connection } from 'next/server'

export const unstable_instant = { level: 'warning' as const }

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        explicit-warning: per-segment `level: 'warning'` lowers from
        'experimental-error'.
      </p>
    </main>
  )
}
