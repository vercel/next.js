'use client'

import { useSearchParams } from 'next/navigation'
import { assert } from '../../../../client-assertion-error'

export function SearchParamsReader() {
  const sp = useSearchParams()

  assert(
    sp.get('single') === 'test',
    `Expected sp.get('single') === 'test', got '${sp.get('single')}'`
  )

  const multiple = sp.getAll('multiple')
  assert(
    multiple.length === 2 && multiple[0] === 'a' && multiple[1] === 'b',
    `Expected sp.getAll('multiple') === ['a', 'b'], got ${JSON.stringify(multiple)}`
  )

  assert(
    sp.get('missing') === null,
    `Expected sp.get('missing') === null, got '${sp.get('missing')}'`
  )

  return null
}
