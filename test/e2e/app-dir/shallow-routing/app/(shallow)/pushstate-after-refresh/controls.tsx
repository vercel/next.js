'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function Controls() {
  const router = useRouter()
  const searchParams = useSearchParams()
  return (
    <>
      <p id="my-data">{searchParams.get('query') ?? 'none'}</p>
      <button
        id="push-a"
        onClick={() => window.history.pushState(null, '', '?query=a')}
      >
        Push a
      </button>
      <button
        id="push-b"
        onClick={() => window.history.pushState(null, '', '?query=b')}
      >
        Push b
      </button>
      <button id="refresh" onClick={() => router.refresh()}>
        Refresh
      </button>
    </>
  )
}
