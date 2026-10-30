'use client'
import { useParams } from 'next/navigation'

export function ClientSlug() {
  const { slug } = useParams<{ slug: string }>()
  return <p id="client-slug">Client slug: {slug}</p>
}
