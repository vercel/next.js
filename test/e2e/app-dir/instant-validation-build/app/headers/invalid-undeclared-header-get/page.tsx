import { headers } from 'next/headers'
import { Suspense } from 'react'
import assert from 'node:assert/strict'

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
  const headersStore = await headers()
  // TODO(instant-validation-build): should this throw in addition to aborting?
  const undeclaredHeader = headersStore.get('undeclaredHeader')
  assert.strictEqual(
    undeclaredHeader,
    undefined,
    `Header 'undeclaredHeader' should not be present`
  )
  return null
}
