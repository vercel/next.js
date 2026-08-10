'use client'
import { describeDocsVendor } from './vendor-docs'
import { useState } from 'react'
export default function ScrollToTop() {
  const [pressed, setPressed] = useState(false)
  return (
    <button
      type="button"
      className="scroll-top text-xs text-muted"
      data-pressed={pressed}
      onClick={() => setPressed(true)}
    >
      ↑ Back to top
    </button>
  )
}
export const __vendor = typeof describeDocsVendor
