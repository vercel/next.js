'use client'

import { use } from 'react'

export function SlugClient({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <p>{`Slug: ${slug}`}</p>
}
