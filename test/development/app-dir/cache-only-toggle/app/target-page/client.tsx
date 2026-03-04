'use client'

import { useSearchParams } from 'next/navigation'

export default function QueryParamReader() {
  const searchParams = useSearchParams()

  return <p>Search: {searchParams.get('search')}</p>
}
