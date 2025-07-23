import { cookies } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses `cookies()` in `'use cache'`, which triggers an
        error.
      </p>
      <CookiesReadingComponent />
    </>
  )
}

async function CookiesReadingComponent() {
  'use cache'

  // Reading cookies in a non-private cache context is not allowed. We're
  // try/catching here to ensure that this error is shown even when it's caught
  // in userland.
  try {
    await cookies()
  } catch {}

  return null
}
