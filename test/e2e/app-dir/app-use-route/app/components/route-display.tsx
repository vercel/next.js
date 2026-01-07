'use client'

import React, { useState, useEffect } from 'react'
import { unstable_useRoutes, usePathname } from 'next/navigation'

export function RouteDisplay({ testId }: { testId?: string | undefined }) {
  const getRoutes = unstable_useRoutes()
  const pathname = usePathname()
  const [routes, setRoutes] = useState<string[] | undefined>(undefined)

  useEffect(() => {
    setRoutes(getRoutes())
  }, [getRoutes])

  return (
    <div>
      <div id="pathname" data-testid="pathname">
        {pathname}
      </div>
      <div id="routes" data-testid={testId || 'routes'}>
        {routes ? JSON.stringify(routes) : 'loading...'}
      </div>
    </div>
  )
}
