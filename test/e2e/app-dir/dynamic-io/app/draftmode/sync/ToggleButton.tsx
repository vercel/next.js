'use client'

import { useRouter } from 'next/navigation'

export default function ToggleButton() {
  const router = useRouter()

  return (
    <button
      onClick={() =>
        fetch('/draftmode/sync/toggle').then(() => router.refresh())
      }
    >
      Toggle Draft Mode
    </button>
  )
}
