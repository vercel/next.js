'use client'

import { useState, useTransition } from 'react'
import { readRequestHeaders } from './actions'

export function ActionButton() {
  const [result, setResult] = useState('')
  const [isPending, startTransition] = useTransition()

  return (
    <>
      <button
        onClick={() => {
          startTransition(async () => {
            setResult(await readRequestHeaders())
          })
        }}
      >
        Run action
      </button>
      <p id="action-result">{isPending ? 'Pending action' : result}</p>
    </>
  )
}
