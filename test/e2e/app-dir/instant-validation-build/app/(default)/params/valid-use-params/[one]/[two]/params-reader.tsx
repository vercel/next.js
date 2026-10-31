'use client'

import { useParams } from 'next/navigation'
import { assert } from '../../../../../../client-assertion-error'

export function ParamsReader() {
  const params = useParams()

  assert(
    params.one === '123',
    `Expected params.one === '123', got '${params.one}'`
  )

  assert(
    params.two === '456',
    `Expected params.two === '456', got '${params.two}'`
  )

  // We're allowed to access names that don't correspond to a param.
  assert(
    'three' in params === false,
    `Expected \`'three' in params\` to be false`
  )
  assert(
    params.three === undefined,
    `Expected \`params.three\` to be undefined, got ${params.three}`
  )

  return null
}
