'use client'

import { useRouter } from 'next/navigation'

export default function ToggleButton() {
  const router = useRouter()

  return (
    <button
      onClick={() =>
        fetch('/draftmode/async/toggle').then(() => router.refresh())
      }
    >
      Toggle Draft Mode
    </button>
  )
}
