'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  return (
    <div
      id="page"
      style={{
        background: 'yellow',
        height: 100,
        width: 100,
      }}
    >
      <button
        id="refresh"
        onClick={() => {
          router.refresh()
        }}
      >
        refresh
      </button>
      <button
        id="navigate-to-small-page"
        onClick={() => {
          //   startTransition(() => {router.push('/client/small-page');router.refresh();})
        }}
      >
        navigate to small-page and refresh
      </button>
    </div>
  )
}
