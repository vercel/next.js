'use client'

import { useParams } from 'next/navigation'

export default function DocsCatchAllClient() {
  const { slug } = useParams()
  return <h1>{`catchall:${slug.join('/')}`}</h1>
}
