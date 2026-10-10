'use client'

import { useRouter } from 'next/navigation'
import { ViewTransition } from 'react'

export default function Page() {
  const router = useRouter()

  return (
    <ViewTransition name="hidden-document-page">
      <button onClick={() => router.push('/hidden-document/destination')}>
        Navigate
      </button>
    </ViewTransition>
  )
}
