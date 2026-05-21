'use client'

import { useSearchParams } from 'next/navigation'

export default function Unauthorized() {
  const searchParams = useSearchParams()

  return <p>unauthorized {searchParams.get('foo')}</p>
}
