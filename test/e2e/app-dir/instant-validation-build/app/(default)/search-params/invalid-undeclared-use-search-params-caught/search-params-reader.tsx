'use client'

import { useSearchParams } from 'next/navigation'
import { ensureThrows } from '../../../../ensure-error'

export function SearchParamsReader() {
  const sp = useSearchParams()
  try {
    ensureThrows(
      () => sp.get('undeclared'),
      `Expected accessing an undeclared search param to throw`
    )
  } catch {
    // We swallow the error. It should still be reported and fail the validation.
  }
  return null
}
