'use client'

import { useState } from 'react'
import { getDeferredValue } from './actions'

export function ActionButton() {
  const [result, setResult] = useState('')
  return (
    <>
      <button
        id="call-action"
        onClick={async () => setResult(await getDeferredValue())}
      >
        call action
      </button>
      <p id="action-result">{result}</p>
    </>
  )
}
