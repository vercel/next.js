'use client'

import { useSearchParams } from 'next/navigation'

export default function NotFound() {
  const searchParams = useSearchParams()

  return <p>not found {searchParams.get('foo')}</p>
}
