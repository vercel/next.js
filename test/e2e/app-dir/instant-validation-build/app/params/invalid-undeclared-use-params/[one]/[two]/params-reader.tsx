'use client'

import { useParams } from 'next/navigation'

export function ParamsReader() {
  const params = useParams()
  // 'two' is not in the sample's params, so this should error
  const value = params.two
  return <div id="result">two: {value}</div>
}
