import { cookies } from 'next/headers'
import assert from 'node:assert/strict'
import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

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
  // TODO(instant-validation-build): should this throw in addition to aborting?
  const hasUndeclaredCookie = cookieStore.has('undeclaredCookie')
  assert.strictEqual(
    hasUndeclaredCookie,
    false,
    `has() should return false for missing cookies`
  )
  return null
}
