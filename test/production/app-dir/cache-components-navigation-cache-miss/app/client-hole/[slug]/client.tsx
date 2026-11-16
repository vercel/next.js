'use client'

import { useSearchParams } from 'next/navigation'

export function ClientHole() {
  return <p>Search: {useSearchParams().get('value')}</p>
}
