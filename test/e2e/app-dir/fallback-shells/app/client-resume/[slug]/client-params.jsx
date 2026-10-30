'use client'

import { useParams } from 'next/navigation'

export function ClientParams() {
  const { slug } = useParams()
  return <p id="slug">Slug: {slug}</p>
}
