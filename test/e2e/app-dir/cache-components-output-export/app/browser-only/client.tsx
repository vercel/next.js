'use client'

import { use } from 'react'
import { browser } from 'react-dom'
import type {} from 'react-dom/canary'

export function BrowserOnly() {
  use(browser())
  return <p id="browser">Browser-only content</p>
}
