import { cookies } from 'next/headers'
import { Fragment, Suspense } from 'react'

export const instant = { level: 'experimental-error' }

export default async function Page() {
  return (
    <main>
      <p>
        This page uses sync IO after awaiting cookies():
        <SuspenseIfNotPartialPrefetching>
          <SyncIOAfterCookies />
        </SuspenseIfNotPartialPrefetching>
      </p>
    </main>
  )
}

// Before partialPrefetching, cookies() is not allowed in shells,
// so it would fail instant validation unless wrapped in suspense.
// We're not interested in checking if cookies blocks,
// only in wheter the Sync IO after triggers an error.
const SuspenseIfNotPartialPrefetching = process.env.__NEXT_PARTIAL_PREFETCHING
  ? Fragment
  : Suspense

async function SyncIOAfterCookies() {
  await cookies()
  return Date.now()
}
