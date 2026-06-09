import { headers } from 'next/headers'
import { Suspense } from 'react'
import { ensureThrows } from '../../../../ensure-error'

export const unstable_instant = {
  level: 'experimental-error',
  unstable_samples: [{ headers: [] }],
}
export const prefetch = 'allow-runtime'

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
  ensureThrows(
    () => headerStore.has('undeclaredHeader'),
    `Expected has() to throw for undeclared headers`
  )
  return null
}
