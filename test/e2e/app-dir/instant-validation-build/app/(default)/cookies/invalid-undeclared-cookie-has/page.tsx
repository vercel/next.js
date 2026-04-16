import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { ensureThrows } from '../../../../ensure-error'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}
export const unstable_prefetch = 'runtime'

export default async function Page() {
  return (
    <main>
      <p>
        This page reads a cookie that is not declared in the sample, so it
        should fail validation with an exhaustiveness error.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <TestCookies />
      </Suspense>
    </main>
  )
}

async function TestCookies() {
  const cookieStore = await cookies()
  ensureThrows(
    () => cookieStore.has('undeclaredCookie'),
    `Expected has() to throw for undeclared cookies`
  )
  return null
}
