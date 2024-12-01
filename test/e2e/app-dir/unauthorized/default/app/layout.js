'use client'

import { useState, Suspense } from 'react'
import { unauthorized } from 'next/navigation'
import ForbiddenTrigger from './unauthorized-trigger'

export default function Root({ children }) {
  const [clicked, setClicked] = useState(false)
  if (clicked) {
    unauthorized()
  }

  return (
    <html className="root-layout-html">
      <body>
        <Suspense fallback={<div>Loading...</div>}>
          <ForbiddenTrigger />
        </Suspense>
        <button id="trigger-unauthorized" onClick={() => setClicked(true)}>
          Click to unauthorized
        </button>
        {children}
      </body>
    </html>
  )
}

export const dynamic = 'force-dynamic'
