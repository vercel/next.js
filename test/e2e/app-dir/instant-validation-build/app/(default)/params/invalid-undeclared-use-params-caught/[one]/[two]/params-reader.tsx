'use client'

import { useParams } from 'next/navigation'

export function ParamsReader() {
  const params = useParams()
  // 'two' is not in the sample's params, so this should error
  try {
    const twoValue = params.two
    // prevent DCE of unused expression
    if (Math.random() > 1) {
      console.log(twoValue)
    }
  } catch {
    // We swallow the error. It should still be reported and fail the validation.
  }
  return null
}
