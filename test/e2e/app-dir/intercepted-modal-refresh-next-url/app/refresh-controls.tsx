'use client'

import { useRouter } from 'next/navigation'
import { revalidateRoot } from './actions'

export function RefreshControls() {
  const router = useRouter()

  return (
    <>
      <button id="refresh" onClick={() => router.refresh()}>
        Refresh
      </button>
      <button id="revalidate" onClick={() => revalidateRoot()}>
        Revalidate
      </button>
    </>
  )
}
