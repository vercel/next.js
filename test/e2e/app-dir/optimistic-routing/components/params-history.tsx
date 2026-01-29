'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'

/**
 * Accumulates all param values rendered throughout the app's lifetime.
 * Uses the setState-in-render pattern to capture changes synchronously,
 * before React commits. This catches any intermediate/wrong params that
 * might flash briefly due to incorrect route prediction.
 */
export function ParamsHistory() {
  const params = useParams()
  const paramsJson = JSON.stringify(params)

  const [history, setHistory] = useState<string[]>([paramsJson])
  const [prevParams, setPrevParams] = useState(paramsJson)

  // setState-in-render pattern: update state synchronously during render
  // if the params have changed. This captures intermediate states.
  if (paramsJson !== prevParams) {
    setPrevParams(paramsJson)
    setHistory((prev) => [...prev, paramsJson])
  }

  return (
    <div
      id="params-history"
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
        Params History (debug)
      </div>
      <div>Current: {paramsJson}</div>
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
