import { headers, type UnsafeUnwrappedHeaders } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses headers synchronously at runtime. This triggers a
        type error. In dev mode, we also log an explicit error that `headers()`
        should be awaited.
      </p>
      <Suspense>
        <HeadersReadingComponent />
      </Suspense>
    </>
  )
}

async function HeadersReadingComponent() {
  // Await a connection to test the subsequent sync headers access at runtime.
  await connection()

  const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
    'user-agent'
  )
  return (
    <div>
      this component reads the `user-agent` header synchronously: {userAgent}
    </div>
  )
}
