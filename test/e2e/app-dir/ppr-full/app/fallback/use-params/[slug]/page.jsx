'use client'

import { useParams } from 'next/navigation'

export default function Page() {
  const params = useParams()

  return <div data-slug={params.slug}>{params.slug}</div>
}
