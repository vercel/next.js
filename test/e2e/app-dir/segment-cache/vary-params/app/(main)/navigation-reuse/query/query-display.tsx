'use client'

import { useSearchParams } from 'next/navigation'

export function QueryDisplay() {
  const searchParams = useSearchParams()
  const x = searchParams !== null ? searchParams.get('x') : null
  return <p id="client-query">{x}</p>
}
