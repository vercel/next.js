'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function ApiToken({ token, icon }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <span className="api-token mono text-xs">
      {revealed ? token : token.slice(0, 4) + '••••••••' + token.slice(-4)}
      <button
        type="button"
        aria-label={revealed ? 'Hide token' : 'Reveal token'}
        onClick={() => setRevealed((r) => !r)}
      >
        {icon}
      </button>
    </span>
  )
}
export const __vendor = typeof describeBulkGraph
