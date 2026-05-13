import { connection } from 'next/server'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `connection()` in `'use cache'`, which triggers an
        error.
      </p>
      <ConnectionCallingComponent />
    </>
  )
}

async function ConnectionCallingComponent() {
  'use cache'

  // Calling connection() in a cache context is not allowed. We're try/catching
  // here to ensure that this error is shown even when it's caught in userland.
  try {
    await connection()
  } catch {}

  return null
}
