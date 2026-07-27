'use client'

import { useParams } from 'next/navigation'
import { ensureThrows } from '../../../../../../ensure-error'

export function ParamsReader() {
  const params = useParams()
  try {
    // We're not allowed to access params not in the samples.
    ensureThrows(
      () => params.two,
      `Expected accessing an undeclared param to throw`
    )
  } catch {
    // We swallow the error. It should still be reported and fail the validation.
  }
  return null
}
