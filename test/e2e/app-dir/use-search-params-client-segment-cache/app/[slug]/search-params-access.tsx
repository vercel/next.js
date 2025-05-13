'use client'

import { useSearchParams } from 'next/navigation'

export function SearchParamsAccess() {
  const searchParams = useSearchParams()
  return <p>{searchParams.get('foo')}</p>
}
