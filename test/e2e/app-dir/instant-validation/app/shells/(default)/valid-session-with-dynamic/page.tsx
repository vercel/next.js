import { Instant } from 'next'
import { io } from 'next/cache'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ cookies: [] }],
}

export const prefetch = 'partial'

export default async function Page() {
  return (
    <main>
      <p>
        This page has an unguarded session data access. This is allowed in a
        shell, so it should pass validation.
      </p>
      <SessionData />
      <Suspense fallback={'Loading...'}>
        <DynamicData />
      </Suspense>
    </main>
  )
}

async function SessionData() {
  await cookies()
  return <div>Session data</div>
}

async function DynamicData() {
  await io()
  return <div>Dynamic data</div>
}
