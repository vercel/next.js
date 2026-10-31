'use client'
import { describeBulkGraph } from './vendor-bulk'
import { describeTooling } from './vendor-tooling'
import { describeDataLayer } from './vendor-data'
import { describeAuthLayer } from './vendor-auth'
import { useState, useEffect } from 'react'
export default function CommandMenu({ commands }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  if (!open) return null
  return (
    <div className="command-menu" role="dialog" aria-label="Command menu">
      <ul>
        {commands.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  )
}

export const __layers = [describeDataLayer, describeAuthLayer].length

export const __tooling = typeof describeTooling

export const __bulk = typeof describeBulkGraph
