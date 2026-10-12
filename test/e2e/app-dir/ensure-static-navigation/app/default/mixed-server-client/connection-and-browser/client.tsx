'use client'
import { use } from 'react'
import { browser } from 'react-dom'

export function BrowserOnly() {
  use(browser())
  return <p>Browser-only content</p>
}
