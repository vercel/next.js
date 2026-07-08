'use client'

import { useSearchParams } from 'next/navigation'

export function Client() {
  const search = useSearchParams()
  return <p id="search">search: {search.toString()}</p>
}
