'use client'

import { useState, useTransition } from 'react'
import { dynamicAction } from './action'

export default function Page() {
  const [result, setResult] = useState('initial')
  const [isPending, startTransition] = useTransition()

  return (
    <div>
      <h1>Server Action on Optional Catch-All Route</h1>
      <button
        id="action-button"
        onClick={() => {
          startTransition(async () => {
            const res = await dynamicAction('action-result')
            setResult(res)
          })
        }}
      >
        {isPending ? 'Pending...' : 'Call Action'}
      </button>
      <p id="action-result">{result}</p>
    </div>
  )
}
