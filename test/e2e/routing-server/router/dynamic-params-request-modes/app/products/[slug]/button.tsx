'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { refreshProduct } from './actions'

export function ActionButton() {
  const [ready, setReady] = useState(false)
  const [result, setResult] = useState('not called')

  useEffect(() => {
    // Keep the reference after navigating to a page that does not import it.
    // The next invocation must be forwarded to this action's route worker.
    window.retainedClosedAction = refreshProduct
    setReady(true)
  }, [])

  return (
    <>
      <p id="action-ready">{ready ? 'ready' : 'loading'}</p>
      <button
        id="call-action"
        onClick={async () => {
          try {
            setResult(await refreshProduct())
          } catch (error) {
            setResult(`error: ${String(error)}`)
          }
        }}
      >
        Refresh product
      </button>
      <p id="action-result">{result}</p>
      <Link id="navigate-home" href="/" prefetch={false}>
        Home
      </Link>
    </>
  )
}
