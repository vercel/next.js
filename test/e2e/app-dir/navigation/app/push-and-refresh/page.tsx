'use client'

import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  return (
    <div>
      <h1>Home</h1>
      <button
        id="push-and-refresh"
        onClick={() => {
          // Refresh in the same tick so the refresh state can supersede the
          // navigation's state before React commits it.
          router.push('/push-and-refresh/dest')
          router.refresh()
        }}
      >
        Push and refresh
      </button>
    </div>
  )
}
