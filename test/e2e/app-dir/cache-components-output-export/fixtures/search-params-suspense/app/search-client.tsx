'use client'
import { useSearchParams } from 'next/navigation'

export default function SearchClient() {
  const params = useSearchParams()
  return <p id="q">q: {params.get('q') ?? 'none'}</p>
}
