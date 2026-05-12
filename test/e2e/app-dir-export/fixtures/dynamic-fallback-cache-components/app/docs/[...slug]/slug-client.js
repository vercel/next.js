'use client'

import { useParams } from 'next/navigation'

export default function DocsSlugClient() {
  const params = useParams()

  return (
    <h1>{Array.isArray(params.slug) ? params.slug.join('/') : 'missing'}</h1>
  )
}
