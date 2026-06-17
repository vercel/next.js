'use client'

import { assert } from '../../../../client-assertion-error'

export function ClientChild({ cookieStore }: { cookieStore: unknown }) {
  // Flight serializes cookies as an iterable, i.e. a sequence of entries
  assert(
    JSON.stringify(cookieStore) ===
      JSON.stringify([
        ['testCookie', { name: 'testCookie', value: 'testValue' }],
      ]),
    `Unexpected value for cookieStore: ${JSON.stringify(cookieStore)}`
  )

  return null
}
