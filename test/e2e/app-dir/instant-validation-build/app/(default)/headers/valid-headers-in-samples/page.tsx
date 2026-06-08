import type { Instant } from 'next'
import { headers } from 'next/headers'
import assert from 'node:assert'

import { Suspense } from 'react'

export const unstable_instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [
    {
      headers: [
        ['testHeader', 'testValue'],
        ['missingHeader', null],
      ],
    },
  ],
}
export const prefetch = 'allow-runtime'

export default async function Page() {
  return (
    <main>
      <p>
        When validated in build, the page should receive the headers specified
        in the sample.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <TestHeaders />
      </Suspense>
    </main>
  )
}

async function TestHeaders() {
  const headerStore = await headers()

  const testHeader = headerStore.get('testHeader')
  assert.equal(testHeader, 'testValue')

  const missingHeader = headerStore.get('missingHeader')
  assert.equal(missingHeader, undefined)
  assert.equal(headerStore.has('missingHeader'), false)

  // TODO(instant-validation-build): test iteration

  return null
}
