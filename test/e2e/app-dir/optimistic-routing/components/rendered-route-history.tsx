'use client'

import { useState } from 'react'
import { useParams, usePathname, useSearchParams } from 'next/navigation'

type RenderedRouteEntry = {
  url: string
  params: Record<string, string | string[] | undefined>
}

/**
 * Accumulates every [url, params] pair rendered throughout the app's lifetime.
 * Uses the setState-in-render pattern to capture changes synchronously,
 * before React commits. This catches any intermediate/wrong route state that
 * might flash briefly due to incorrect route prediction.
 */
export function RenderedRouteHistory() {
  const params = useParams()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const search = searchParams.toString()
  const url = search ? `${pathname}?${search}` : pathname
  const entry: RenderedRouteEntry = { url, params }
  const entryJson = JSON.stringify(entry)

  const [history, setHistory] = useState<string[]>([entryJson])
  const [prevEntry, setPrevEntry] = useState(entryJson)

  // setState-in-render pattern: update state synchronously during render
  // if the route state has changed. This captures intermediate states.
  if (entryJson !== prevEntry) {
    setPrevEntry(entryJson)
    setHistory((prev) => [...prev, entryJson])
  }

  return (
    <div
      id="rendered-route-history"
      data-history={JSON.stringify(history)}
      style={{
        padding: '8px',
        marginTop: '16px',
        background: '#f5f5f5',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
        Rendered Route History (debug)
      </div>
      <div>Current: {entryJson}</div>
      <div style={{ marginTop: '4px' }}>
        History:{' '}
        {history.map((h, i) => (
          <span key={i}>
            {i > 0 && ' → '}
            {h}
          </span>
        ))}
      </div>
    </div>
  )
}
