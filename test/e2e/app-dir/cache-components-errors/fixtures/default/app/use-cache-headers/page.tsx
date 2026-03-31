import { headers } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses `headers()` in `'use cache'`, which triggers an
        error.
      </p>
      <HeadersReadingComponent />
    </>
  )
}

async function HeadersReadingComponent() {
  'use cache'

  // Reading headers in a cache context is not allowed. We're try/catching here
  // to ensure that this error is shown even when it's caught in userland.
  try {
    await headers()
  } catch {}

  return null
}
