'use client'

import { useState } from 'react'

// Invokes a Server Action and renders the settled result, the way an app
// would observe its own action's returned promise.
export function ActionButton({ action }: { action: () => Promise<string> }) {
  const [result, setResult] = useState('')
  return (
    <>
      <button
        id="invoke-action"
        onClick={() => {
          action().then(
            (value) => setResult(`fulfilled: ${value}`),
            (error) => setResult(`rejected: ${error.message}`)
          )
        }}
      >
        Invoke server action
      </button>
      <p id="action-result">{result}</p>
    </>
  )
}
