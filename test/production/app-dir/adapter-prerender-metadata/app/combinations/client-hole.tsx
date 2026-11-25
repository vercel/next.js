'use client'

import { useSearchParams } from 'next/navigation'

export function ClientHole() {
  return <p>query: {useSearchParams()?.get('query')}</p>
}
