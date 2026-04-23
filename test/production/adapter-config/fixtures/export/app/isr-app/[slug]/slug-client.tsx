'use client'

import { useParams } from 'next/navigation'

export function SlugClient() {
  const params = useParams<{ slug: string }>()
  return <p>slug: {params?.slug}</p>
}
