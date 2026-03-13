'use client'

import { assert } from '../../../../../client-assertion-error'

export function ClientChild({ params }: { params: Record<string, string> }) {
  assert(
    params.slug === 'hello',
    `Expected params.slug === 'hello', got '${params.slug}'`
  )

  assert(
    JSON.stringify(Object.keys(params)) === JSON.stringify(['slug']),
    `Expected Object.keys(params) to be ["slug"], got ${JSON.stringify(Object.keys(params))}`
  )

  return <div id="slug">{params.slug}</div>
}
