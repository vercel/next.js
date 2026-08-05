'use client'

import { useState, useTransition } from 'react'
import { runCachedFunction } from './cached'

export function CachedFunctionButton() {
  const [result, setResult] = useState('idle')
  const [, startTransition] = useTransition()

  return (
    <>
      <button
        id="run-cached-function"
        type="button"
        onClick={() => {
          startTransition(async () => {
            setResult(await runCachedFunction())
          })
        }}
      >
        Run cached function
      </button>
      <p id="cached-function-result">{result}</p>
    </>
  )
}
