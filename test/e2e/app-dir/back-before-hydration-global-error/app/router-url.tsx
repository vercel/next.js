'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Reports the router's URL once the App Router has installed its history
// handlers (its effect runs after this child effect). Until then it renders
// nothing, so a test reading it cannot mistake server HTML for router state.
export function RouterUrl() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const [isRouterReady, setIsRouterReady] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setIsRouterReady(true), 0)
    return () => clearTimeout(timeout)
  }, [])

  if (!isRouterReady) {
    return null
  }
  return (
    <output id="router-url">{pathname + (search ? `?${search}` : '')}</output>
  )
}
