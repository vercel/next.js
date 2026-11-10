'use client'

import { assert } from '../../../../client-assertion-error'

export function ClientChild({ headerStore }: { headerStore: unknown }) {
  // Flight serializes headers as an iterable, i.e. a sequence of entries
  assert(
    JSON.stringify(headerStore) ===
      JSON.stringify([['x-test-header', 'testValue']]),
    `Unexpected value for headerStore: ${JSON.stringify(headerStore)}`
  )

  return null
}
