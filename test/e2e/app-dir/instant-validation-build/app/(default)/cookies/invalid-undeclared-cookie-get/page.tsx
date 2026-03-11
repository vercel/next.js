import { cookies } from 'next/headers'
import { Suspense } from 'react'
import assert from 'node:assert/strict'

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
  const undeclaredCookie = cookieStore.get('undeclaredCookie')
  assert.strictEqual(
    undeclaredCookie,
    undefined,
    `Cookie 'undeclaredCookie' should not be present`
  )
  return null
}
