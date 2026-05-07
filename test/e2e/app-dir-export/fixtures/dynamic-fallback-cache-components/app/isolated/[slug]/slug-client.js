'use client'

import { useParams } from 'next/navigation'

export default function IsolatedSlugClient() {
  const params = useParams()
  return <h1>{params.slug}</h1>
}
