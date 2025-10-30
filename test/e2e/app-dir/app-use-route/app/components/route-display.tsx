'use client'

import React from 'react'
import { useRoute, usePathname } from 'next/navigation'

export function RouteDisplay({ testId }: { testId?: string }) {
  const route = useRoute()
  const pathname = usePathname()

  return (
    <div>
      <div id="pathname" data-testid="pathname">
        {pathname}
      </div>
      <div id="route" data-testid={testId || 'route'}>
        {route}
      </div>
    </div>
  )
}
