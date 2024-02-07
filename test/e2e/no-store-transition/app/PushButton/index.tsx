'use client'

import { useRouter } from 'next/navigation'

export default function PushButton() {
  const router = useRouter()

  return (
    <p>
      <button
        onClick={() => router.push('/private/by-push')}
        id="to-private-by-push"
      >
        to /private/by-push
      </button>
    </p>
  )
}
