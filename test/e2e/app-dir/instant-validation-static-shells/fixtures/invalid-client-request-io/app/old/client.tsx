'use client'
import { useSearchParams } from 'next/navigation'

export function SearchParamsClient() {
  const searchParams = useSearchParams()
  return <p>SearchParams: {searchParams.get('id')}</p>
}
