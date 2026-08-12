'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function CommitProbe() {
  const pathname = usePathname()
  if (typeof window !== 'undefined') {
    console.log(`[bbh-debug] probe render pathname=${pathname}`)
  }
  useEffect(() => {
    console.log(
      `[bbh-debug] COMMIT pathname=${pathname} location=${window.location.pathname + window.location.search} h1=${document.querySelector('h1')?.textContent ?? 'none'}`
    )
  })
  return null
}
