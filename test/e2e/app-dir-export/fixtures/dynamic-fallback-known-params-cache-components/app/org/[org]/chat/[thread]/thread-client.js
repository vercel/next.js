'use client'

import { useParams } from 'next/navigation'

export default function OrgThreadClient() {
  const params = useParams()

  return (
    <h1>
      {params.org}:{params.thread}
    </h1>
  )
}
