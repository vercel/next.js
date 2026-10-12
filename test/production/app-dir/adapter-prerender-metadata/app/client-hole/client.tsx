'use client'
import { useSearchParams } from 'next/navigation'

export function ClientHole() {
  const searchParams = useSearchParams()
  return <p>q: {searchParams?.get('q')}</p>
}
