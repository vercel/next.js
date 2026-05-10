'use client'

import { useParams } from 'next/navigation'

export function DynamicPrefetchValue() {
  const params = useParams<{ value: string }>()

  return <p id="dynamic-prefetch-page">dynamic prefetch path: {params.value}</p>
}
