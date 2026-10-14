'use client'
import { useSearchParams } from 'next/navigation'

export function ClientSearch() {
  const search = useSearchParams()
  return <div>Search: {search.toString()}</div>
}
