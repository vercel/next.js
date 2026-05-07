'use client'

import { useParams } from 'next/navigation'

export default function DocsSectionPageClient() {
  const params = useParams()

  return (
    <h1>
      {params.section}:{params.page}
    </h1>
  )
}
