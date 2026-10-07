'use client'

import { useRouter } from 'next/navigation'
import { runServerAction } from './actions'

export default function Page() {
  const router = useRouter()

  return (
    <button
      onClick={() => {
        // Start server action WITHOUT awaiting
        runServerAction()

        // Immediately navigate away
        router.push('/next')
      }}
      id="run-action"
    >
      Run server action
    </button>
  )
}
