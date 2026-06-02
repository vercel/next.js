// Page explicitly opts out of instant validation. Under the framework
// default (`'warning'`), this segment-level override suppresses the
// implicit validation that would otherwise fire on a bare page, so no
// redbox appears.
import { connection } from 'next/server'

export const unstable_instant = false

export default async function Page() {
  await connection()
  return (
    <main>
      <p>explicit-false page (segment opts out of validation).</p>
    </main>
  )
}
