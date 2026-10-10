'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function KeyboardHint({ icon }) {
  const [shown, setShown] = useState(false)
  return (
    <button
      type="button"
      className="keyboard-hint text-xs"
      aria-pressed={shown}
      onClick={() => setShown((s) => !s)}
    >
      {icon}{' '}
      {shown ? '⌘K commands · ⌘/ shortcuts · gd deployments' : 'Shortcuts'}
    </button>
  )
}
export const __vendor = typeof describeBulkGraph
