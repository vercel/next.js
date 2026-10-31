'use client'
import { use } from 'react'
// @ts-ignore  typescript is unhappy with this import for some reason
import { browser } from 'react-dom'

export function BrowserOnly() {
  use(browser())
  return <p id="browser-content">Browser-only content</p>
}
