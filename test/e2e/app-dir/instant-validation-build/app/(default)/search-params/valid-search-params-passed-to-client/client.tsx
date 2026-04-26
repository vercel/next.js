'use client'

import { assert } from '../../../../client-assertion-error'

export function ClientChild({
  searchParams,
}: {
  searchParams: Record<string, string | string[]>
}) {
  assert(
    searchParams.single === 'test',
    `Expected searchParams.single === 'test', got '${searchParams.single}'`
  )
  return <div id="single">{searchParams.single}</div>
}
