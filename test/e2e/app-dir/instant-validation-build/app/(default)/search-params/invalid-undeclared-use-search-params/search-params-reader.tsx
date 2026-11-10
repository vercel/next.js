'use client'

import { useSearchParams } from 'next/navigation'
import { ensureThrows } from '../../../../ensure-error'

export function SearchParamsReader() {
  const sp = useSearchParams()
  ensureThrows(
    () => sp.get('undeclared'),
    `Expected accessing an undeclared search param to throw`
  )
  return null
}
