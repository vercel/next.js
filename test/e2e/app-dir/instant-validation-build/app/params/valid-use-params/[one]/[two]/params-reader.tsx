'use client'

import { useParams } from 'next/navigation'
import { ClientAssertionError } from '../../../../../client-assertion-error'

export function ParamsReader() {
  const params = useParams()

  if (params.one !== '123') {
    throw new ClientAssertionError(
      `Expected params.one === '123', got '${params.one}'`
    )
  }

  if (params.two !== '456') {
    throw new ClientAssertionError(
      `Expected params.two === '456', got '${params.two}'`
    )
  }

  return null
}
