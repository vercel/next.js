'use client'

import { useParams } from 'next/navigation'

export default function HydratedThreadClient() {
  const params = useParams()

  return <h1>{params.thread}</h1>
}
