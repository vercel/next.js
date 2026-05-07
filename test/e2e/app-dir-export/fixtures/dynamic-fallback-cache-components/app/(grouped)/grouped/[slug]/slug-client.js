'use client'

import { useParams } from 'next/navigation'

export default function GroupedSlugClient() {
  const params = useParams()

  return <h1>{params.slug}</h1>
}
