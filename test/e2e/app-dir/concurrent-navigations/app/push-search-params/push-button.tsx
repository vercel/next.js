'use client'

import { useRouter } from 'next/navigation'

export function PushButton() {
  const router = useRouter()
  return (
    <button
      id="push-button"
      onClick={() => router.push('/push-search-params?test=pass')}
    >
      Push with search params
    </button>
  )
}
