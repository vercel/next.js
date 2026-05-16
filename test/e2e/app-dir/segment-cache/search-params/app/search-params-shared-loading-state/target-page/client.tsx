'use client'
import { useSearchParams } from 'next/navigation'

export function SearchParamsDisplay() {
  const searchParams = useSearchParams()
  const param = searchParams.get('param')

  return (
    <div id="search-params-content">Search param value: {param || 'none'}</div>
  )
}
