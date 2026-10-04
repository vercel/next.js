'use client'

import { useSearchParams } from 'next/navigation'

export function ClientUrl() {
  const searchParams = useSearchParams()

  return <p>{searchParams.get('q')}</p>
}
