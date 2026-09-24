'use client'

import type { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <input id="persistent-input" aria-label="Persistent input" />
        {children}
      </body>
    </html>
  )
}
