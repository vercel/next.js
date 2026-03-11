'use client'

import { useSearchParams } from 'next/navigation'

export function SearchParamsReader() {
  const sp = useSearchParams()
  // 'undeclared' is not in the sample's searchParams, so this should error
  try {
    const value = sp.get('undeclared')
    // prevent DCE of unused expression
    if (Math.random() > 1) {
      console.log(value)
    }
  } catch {
    // We swallow the error. It should still be reported and fail the validation.
  }
  return null
}
