'use client'

import { useState, type ReactNode } from 'react'
import { useServerInsertedHTML } from 'next/navigation'

// Like a CSS-in-JS style registry: each instance inserts its markup once, on
// the first flush after it rendered.
export function InsertedHTMLRegistry({ children }: { children: ReactNode }) {
  const [registry] = useState(() => ({ flushed: false }))
  useServerInsertedHTML(() => {
    if (registry.flushed) {
      return null
    }
    registry.flushed = true
    return <meta name="cc-inserted-html" content="registry" />
  })
  return children
}
