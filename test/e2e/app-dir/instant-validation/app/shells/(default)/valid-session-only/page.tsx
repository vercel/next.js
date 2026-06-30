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
        This page has an unguarded session data access. This is allowed in a
        shell, so it should pass validation. It does not contain any link or
        dynamic data, so it is completely prefetchable.
      </p>
      <SessionData1 />
      <SessionData2 />
    </main>
  )
}

async function SessionData1() {
  await cookies()
  return <div>Session data 1 (cookies)</div>
}

async function SessionData2() {
  await privateCache()
  return <div>Session data 2 (private cache)</div>
}

async function privateCache() {
  'use cache: private'
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
