'use client'

import { useSearchParams } from 'next/navigation'

export function SearchParamsReader() {
  const sp = useSearchParams()
  // 'undeclared' is not in the sample's searchParams, so this should error
  const value = sp.get('undeclared')
  return <div id="result">undeclared: {value}</div>
}
