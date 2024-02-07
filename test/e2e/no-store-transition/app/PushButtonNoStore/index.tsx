'use client'

import { useRouter } from 'next/navigation'

export default function PushButtonNoStore() {
  const router = useRouter()

  return (
    <p>
      <button
        onClick={() =>
          router.push('/private/by-push', { unstable_noStoreTransition: true })
        }
        id="to-private-by-push-no-store"
      >
        to /private/by-push with no-store-transition
      </button>
    </p>
  )
}
