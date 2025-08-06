import { headers } from 'next/headers'
import { Suspense } from 'react'

export default function Page() {
  return (
    <>
      <p>
        This page uses `headers()` inside `'use cache: private'`, which triggers
        an error at runtime.
      </p>
      <Suspense fallback={<p>Loading...</p>}>
        <Private />
      </Suspense>
    </>
  )
}

async function Private() {
  'use cache: private'

  // Reading headers in a cache context is not allowed. We're try/catching here
  // to ensure that, in dev mode, this error is shown even when it's caught in
  // userland.
  try {
    await headers()
  } catch {}

  return <p id="private">Private</p>
}
