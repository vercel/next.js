'use client'

import { useRouter } from 'next/navigation'

export function TriggerMpaNavigation() {
  const router = useRouter()
  return (
    <button
      id="trigger-navigation"
      onClick={async () => {
        router.push('/slow-page')
        await new Promise((resolve) => setTimeout(resolve, 500))
        router.push('/other-root')
      }}
    >
      Trigger Navigation
    </button>
  )
}
