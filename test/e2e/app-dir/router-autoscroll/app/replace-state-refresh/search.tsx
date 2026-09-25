'use client'

import { useSearchParams } from 'next/navigation'

export function Search() {
  const searchParams = useSearchParams()

  return <div id="search">{searchParams.toString()}</div>
}
