'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export default function Client() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div>
      <button
        id="refresh-button"
        disabled={isPending}
        onClick={() => {
          startTransition(() => {
            router.refresh()
          })
        }}
      >
        {isPending ? 'Refreshing...' : 'router.refresh()'}
      </button>
      <button
        id="reload-button"
        onClick={() => {
          window.location.reload()
        }}
      >
        Reload page
      </button>
    </div>
  )
}
