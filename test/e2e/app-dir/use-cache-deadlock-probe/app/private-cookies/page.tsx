import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { getData, preload } from '../shared'

const sharedUrl =
  'https://next-data-api-endpoint.vercel.app/api/random?page=private-cookies'

// A `'use cache: private'` body that legitimately reads `cookies()` AND
// joins the module-scoped hanging promise from `shared.ts`. The probe must:
//
//   1. Forward the real cookie values into the worker's request store so
//      `cookies()` returns the same values as it would in the real fill
//      (rather than throwing).
//   2. Run the body in a fresh module scope so `getData(sharedUrl)` returns
//      a fresh fetch instead of joining the outer scope's hanging promise.
//
// Both pieces have to work for this test to pass; if request-snapshot
// forwarding regresses, this fixture catches it before any "no-snapshot"
// fallback path.
async function getCachedData(): Promise<string> {
  'use cache: private'

  // Read a cookie — exercises the worker's reconstructed `cookies` object.
  const sessionCookie = (await cookies()).get('next-session')

  // Joins the outer fetch via the module-scoped dedupe map (see note in
  // ../shared.ts).
  const text = await getData(sharedUrl).then((res) => res.text())

  return `${sessionCookie?.value ?? 'no-session'}:${text}`
}

async function Cached() {
  try {
    const data = await getCachedData()
    return <p id="result">{data}</p>
  } catch (error: any) {
    return <p id="result">Error: {error.message}</p>
  }
}

async function Runtime() {
  // Touch cookies in the outer scope to advance to the runtime stage and
  // start the deadlock-prone outer fetch.
  await cookies()

  preload(sharedUrl)

  return <Cached />
}

export default function Page() {
  return (
    <Suspense fallback="Loading...">
      <Runtime />
    </Suspense>
  )
}
