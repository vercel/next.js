'use client'

import { useParams } from 'next/navigation'

export function ClientParams() {
  const { slug } = useParams<{ slug: string[] }>()
  return <pre id="client-params">{JSON.stringify(slug)}</pre>
}
