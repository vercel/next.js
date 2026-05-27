'use client'

import { useParams } from 'next/navigation'

export default function NotFound() {
  const params = useParams<{ slug: string }>()

  return <p>not found {params.slug}</p>
}
