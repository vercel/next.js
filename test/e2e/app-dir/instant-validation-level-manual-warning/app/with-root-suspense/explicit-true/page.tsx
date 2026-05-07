// Same violation as `bare/page.tsx`, but with `unstable_instant = true`.
// `true` is "opt in at the framework default level" — under default
// 'manual-warning', that resolves to warning-level validation. Validation
// should fire in dev but not in build.
import { connection } from 'next/server'

export const unstable_instant = true

export default async function Page() {
  await connection()
  return (
    <main>
      <p>explicit-true: opt in at the framework default level.</p>
    </main>
  )
}
