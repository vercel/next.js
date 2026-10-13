'use client'
import { useSearchParams } from 'next/navigation'

export function ClientSearchQuery() {
  const searchParams = useSearchParams()
  const query = searchParams.get('query') ?? '<none>'
  return <p>{`Query: ${query}`}</p>
}
