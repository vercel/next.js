'use client'

import { useState } from 'react'

declare global {
  interface Window {
    retainedAction?: () => Promise<string>
  }
}

export function HomeButton() {
  const [result, setResult] = useState('not called')

  return (
    <>
      <button
        id="call-retained-action"
        onClick={async () => {
          const action = window.retainedAction
          setResult(action ? await action() : 'missing action')
        }}
      >
        call retained action
      </button>
      <p id="action-result">{result}</p>
    </>
  )
}
