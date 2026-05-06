// Same violation as `bare/page.tsx`, but with `unstable_instant = false`.
// The explicit opt-out should suppress implicit validation entirely — no
// instant redbox in dev, no markers in build, despite the runtime data
// access at the top of the page.
import { connection } from 'next/server'

export const unstable_instant = false

export default async function Page() {
  await connection()
  return (
    <main>
      <p>explicit-false: explicit opt-out suppresses validation.</p>
    </main>
  )
}
