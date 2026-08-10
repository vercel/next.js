'use client'

import { useSearchParams } from 'next/navigation'

export default function Forbidden() {
  const searchParams = useSearchParams()

  return <p>forbidden {searchParams.get('foo')}</p>
}
