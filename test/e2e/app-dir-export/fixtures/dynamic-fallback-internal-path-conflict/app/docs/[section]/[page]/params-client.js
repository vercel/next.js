'use client'

import { useParams } from 'next/navigation'

export default function DocsSectionPageClient() {
  const { section, page } = useParams()
  return <h1>{`${section}:${page}`}</h1>
}
