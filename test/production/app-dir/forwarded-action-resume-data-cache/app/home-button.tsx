'use client'

import { useState } from 'react'

declare global {
  interface Window {
    forwardedAction?: () => Promise<string>
  }
}

export function HomeButton() {
  const [result, setResult] = useState('not called')

  return (
    <>
      <button
        id="call-forwarded-action"
        onClick={async () => {
          const action = window.forwardedAction
          setResult(action ? await action() : 'missing action')
        }}
      >
        call forwarded action
      </button>
      <p id="action-result">{result}</p>
    </>
  )
}
