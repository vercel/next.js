'use client'

import React, { useState, useEffect } from 'react'
import { unstable_useRoute, usePathname } from 'next/navigation'

export function RouteDisplay({ testId }: { testId?: string | undefined }) {
  const getRoute = unstable_useRoute()
  const pathname = usePathname()
  const [route, setRoute] = useState<string | undefined>(undefined)

  useEffect(() => {
    setRoute(getRoute())
  }, [getRoute])

  return (
    <div>
      <div id="pathname" data-testid="pathname">
        {pathname}
      </div>
      <div id="route" data-testid={testId || 'route'}>
        {route ?? 'loading...'}
      </div>
    </div>
  )
}
