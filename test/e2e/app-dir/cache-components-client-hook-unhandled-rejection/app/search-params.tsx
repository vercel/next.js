'use client'

import { useSearchParams } from 'next/navigation'

export function SearchParams() {
  const searchParams = useSearchParams()

  return <p>search param: {searchParams.get('q')}</p>
}
