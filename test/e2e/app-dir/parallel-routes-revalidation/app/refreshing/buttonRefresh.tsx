'use client'
import { useRouter } from 'next/navigation'

export function Button() {
  const router = useRouter()

  return (
    <button
      id="refresh-button"
      style={{ color: 'red', padding: '10px' }}
      onClick={() => router.refresh()}
    >
      Refresh
    </button>
  )
}
