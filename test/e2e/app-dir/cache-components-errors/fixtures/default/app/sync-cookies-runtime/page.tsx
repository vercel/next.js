import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses cookies synchronously at runtime. This triggers a
        type error. In dev mode, we also log an explicit error that `cookies()`
        should be awaited.
      </p>
      <Suspense>
        <CookiesReadingComponent />
      </Suspense>
    </>
  )
}

async function CookiesReadingComponent() {
  // Await a connection to test the subsequent sync cookies access at runtime.
  await connection()
  // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
  const token = (cookies() as any).get('token')

  return (
    <div>
      this component reads the `token` cookie synchronously: {token?.value}
    </div>
  )
}
