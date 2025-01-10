'use client'

import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  return (
    <button
      onClick={() => {
        router.refresh()
      }}
    >
      Refresh
    </button>
  )
}
