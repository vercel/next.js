'use client'

import { useParams } from 'next/navigation'

export default function DocsCatchAllClient() {
  const params = useParams()

  return (
    <h1>
      {Array.isArray(params.slug)
        ? `catchall:${params.slug.join('/')}`
        : 'catchall:missing'}
    </h1>
  )
}
