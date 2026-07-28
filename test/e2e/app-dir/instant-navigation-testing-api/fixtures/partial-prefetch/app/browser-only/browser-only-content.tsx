'use client'

import { use } from 'react'
import { browserOnly } from 'next/navigation'

export function BrowserOnlyContent() {
  use(browserOnly())
  return <p data-testid="browser-only-content">browser-only content</p>
}
