'use client'

import { usePathname } from 'next/navigation'
import { redirectWithHash, revalidate } from '../actions'

export function ActionControls() {
  const pathname = usePathname()

  return (
    <>
      <button id="run-revalidate" onClick={() => revalidate(pathname)}>
        revalidate
      </button>
      <button id="run-redirect-with-hash" onClick={() => redirectWithHash()}>
        redirect with hash
      </button>
    </>
  )
}
