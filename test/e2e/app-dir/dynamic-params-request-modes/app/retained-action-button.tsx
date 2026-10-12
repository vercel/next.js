'use client'

import { useState } from 'react'

declare global {
  interface Window {
    retainedClosedAction?: () => Promise<string>
  }
}

export function RetainedActionButton() {
  const [result, setResult] = useState('not called')
  return (
    <>
      <button
        id="call-retained-action"
        onClick={async () => {
          try {
            setResult(await window.retainedClosedAction!())
          } catch (error) {
            setResult(`error: ${String(error)}`)
          }
        }}
      >
        Call retained action
      </button>
      <p id="action-result">{result}</p>
    </>
  )
}
