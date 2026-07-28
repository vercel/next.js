'use client'

import { use } from 'react'
import { browserOnly } from 'next/navigation'

export function BrowserOnlyContent() {
  use(browserOnly())
  return <p id="browser-content">static browser content</p>
}
