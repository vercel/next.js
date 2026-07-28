'use client'

import { use } from 'react'
import { browserOnly } from 'next/navigation'

export function BrowserOnlyContent() {
  use(browserOnly())
  return <p>browser-only content</p>
}
