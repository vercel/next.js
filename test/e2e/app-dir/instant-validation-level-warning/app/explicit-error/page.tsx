// Same violation as `bare/page.tsx`, but with `unstable_instant = { level:
// 'error' }`. Per-segment override raises the level from the configured
// 'warning' to 'error', so build validation fires and fails the build in
// addition to the dev redbox.
import { connection } from 'next/server'

export const unstable_instant = { level: 'experimental-error' as const }

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        explicit-error: per-segment `level: 'experimental-error'` escalates over
        'warning'.
      </p>
    </main>
  )
}
