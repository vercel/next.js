'use client'

import { useParams } from 'next/navigation'

export default function ReferenceTopicClient() {
  const params = useParams()

  return <h1>{`reference:${params.topic ?? 'missing'}`}</h1>
}
