'use client'
import { useParams } from 'next/navigation'

export function ClientSlug() {
  const { slug } = useParams()
  return <div>Slug: {slug}</div>
}
