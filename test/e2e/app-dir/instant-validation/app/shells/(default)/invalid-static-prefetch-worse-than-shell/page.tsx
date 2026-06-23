import { Instant } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ cookies: [] }],
}

export default async function Page({ searchParams }) {
  return (
    <main>
      <p>
        This page would have session data in its runtime shell, but does not use
        "allow-runtime", so a speculative prefetch would not contain them and
        we'd skip it and display the shell instead. This should trigger a
        warning.
      </p>
      <Suspense>
        <SessionData />
      </Suspense>
    </main>
  )
}

async function SessionData() {
  await cookies()
  return <div>Session data</div>
}
