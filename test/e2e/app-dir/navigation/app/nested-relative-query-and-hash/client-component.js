'use client'

import { useRouter } from 'next/navigation'

export function RouterPushButton() {
  const router = useRouter()

  return (
    <h3 id="h3">
      <button
        id="button-to-h3-hash-only"
        onClick={() => {
          router.push('#h3')
        }}
      >
        To #h3, hash only
      </button>
    </h3>
  )
}
