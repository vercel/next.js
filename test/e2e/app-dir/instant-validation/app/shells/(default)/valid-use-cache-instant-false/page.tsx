import { Instant } from 'next'
import { cookies } from 'next/headers'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ cookies: [] }],
}

export const prefetch = 'partial'

export default async function Page() {
  return (
    <main>
      <p>
        This page has an unguarded session data access, which is allowed in a
        shell but leaves the static shell empty. The parent layout opts out of
        static shell validation with <code>instant = false</code>, exported from
        a file with a top-level <code>"use cache"</code> directive.
      </p>
      <SessionData />
    </main>
  )
}

async function SessionData() {
  await cookies()
  return <div>Session data (cookies)</div>
}
