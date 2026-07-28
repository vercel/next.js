'use client'

import { use } from 'react'
import { browserOnly } from 'next/navigation'

export function BrowserOnlyContent() {
  use(browserOnly())
  return <p id="edge-browser-content">edge browser content</p>
}
