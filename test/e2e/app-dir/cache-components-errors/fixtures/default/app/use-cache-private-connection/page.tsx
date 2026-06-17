import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  return (
    <>
      <p>
        This page uses `connection()` inside `'use cache: private'`, which
        triggers an error at runtime.
      </p>
      <Suspense fallback={<p>Loading...</p>}>
        <Private />
      </Suspense>
    </>
  )
}

async function Private() {
  'use cache: private'

  // TODO: this should be displayed as a Runtime Error even with this delay,
  // but right now we might not read it in time and log it as as a console error instead.
  await new Promise((resolve) => setTimeout(resolve))

  // Calling connection() in a cache context is not allowed. We're try/catching
  // here to ensure that, in dev mode, this error is shown even when it's caught
  // in userland.
  try {
    await connection()
  } catch {}

  return <p id="private">Private</p>
}
