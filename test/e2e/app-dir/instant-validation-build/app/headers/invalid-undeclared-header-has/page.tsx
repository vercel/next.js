import { headers } from 'next/headers'
import assert from 'node:assert/strict'
import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ headers: [] }],
}

export default async function Page() {
  return (
    <main>
      <p>
        This page reads a header that is not declared in the sample, so it
        should fail validation with an exhaustiveness error.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <TestHeaders />
      </Suspense>
    </main>
  )
}

async function TestHeaders() {
  const headerStore = await headers()
  // TODO(instant-validation-build): should this throw in addition to aborting?
  const hasUndeclaredHeader = headerStore.has('undeclaredHeader')
  assert.strictEqual(
    hasUndeclaredHeader,
    false,
    `has() should return false for missing headers`
  )
  return null
}
