import { headers } from 'next/headers'
import { Suspense } from 'react'
import { ensureThrows } from '../../../../ensure-error'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ headers: [] }],
}
export const unstable_prefetch = 'runtime'

export default async function Page() {
  return (
    <main>
      <p>
        This page reads a header that is not declared in the sample, so it
        should fail validation with an exhaustiveness error. It catches the
        error thrown by the header access, but validation should still fail.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <TestHeaders />
      </Suspense>
    </main>
  )
}

async function TestHeaders() {
  const headerStore = await headers()

  try {
    ensureThrows(
      () => headerStore.get('undeclaredHeader'),
      `Expected get() to throw for undeclared headers`
    )
  } catch (err) {
    // We swallow the error. It should still be reported and fail the validation.
  }

  return null
}
