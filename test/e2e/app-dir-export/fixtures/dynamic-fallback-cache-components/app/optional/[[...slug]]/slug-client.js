'use client'

import { useParams } from 'next/navigation'

export default function OptionalSlugClient() {
  const params = useParams()
  const slug = params.slug

  return <h1>{Array.isArray(slug) ? slug.join('/') : 'optional index'}</h1>
}
