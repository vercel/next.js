'use client'

import { useParams } from 'next/navigation'

export default function Page() {
  const params = useParams<{ prefix: string; slug: string }>()
  return <p id="slug">{params?.slug}</p>
}
