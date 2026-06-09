import type { Instant } from 'next'
import { cookies } from 'next/headers'
import assert from 'node:assert'

import { Suspense } from 'react'

export const unstable_instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [
    {
      cookies: [
        { name: 'testCookie', value: 'testValue' },
        { name: 'missingCookie', value: null },
      ],
    },
  ],
}
export const prefetch = 'allow-runtime'

export default async function Page() {
  return (
    <main>
      <p>
        When validated in build, the page should receive the cookies specified
        in the sample.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <TestCookies />
      </Suspense>
    </main>
  )
}

async function TestCookies() {
  const cookieStore = await cookies()

  const testCookie = cookieStore.get('testCookie')
  assert.deepStrictEqual(testCookie, {
    name: 'testCookie',
    value: 'testValue',
  })

  const missingCookie = cookieStore.get('missingCookie')
  assert.equal(missingCookie, undefined)
  assert.equal(cookieStore.has('missingCookie'), false)

  assert.deepStrictEqual(cookieStore.getAll(), [
    { name: 'testCookie', value: 'testValue' },
  ])

  return null
}
