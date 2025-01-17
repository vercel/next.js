'use client'

import { useState, Suspense } from 'react'
import { forbidden } from 'next/navigation'
import ForbiddenTrigger from './forbidden-trigger'

export default function Root({ children }) {
  const [clicked, setClicked] = useState(false)
  if (clicked) {
    forbidden()
  }

  return (
    <html className="root-layout-html">
      <body>
        <Suspense fallback={<div>Loading...</div>}>
          <ForbiddenTrigger />
        </Suspense>
        <button id="trigger-forbidden" onClick={() => setClicked(true)}>
          Click to forbidden
        </button>
        {children}
      </body>
    </html>
  )
}

export const dynamic = 'force-dynamic'
