'use client'

import { useState } from 'react'

export function ActionButtons({
  delayedAction,
  defaultAction,
  inlineAction,
  errorAction,
}: {
  delayedAction: (message: string) => Promise<number>
  defaultAction: () => Promise<string>
  inlineAction: () => Promise<string>
  errorAction: () => Promise<void>
}) {
  const [result, setResult] = useState('')

  return (
    <>
      <button
        id="delayed-action"
        onClick={async () => {
          const length = await delayedAction('super-secret-action-argument')
          setResult(`delayed:${length}`)
        }}
      >
        Delayed action
      </button>
      <button
        id="default-action"
        onClick={async () => setResult(await defaultAction())}
      >
        Default action
      </button>
      <button
        id="inline-action"
        onClick={async () => setResult(await inlineAction())}
      >
        Inline action
      </button>
      <button
        id="error-action"
        onClick={async () => {
          try {
            await errorAction()
          } catch {
            setResult('action failed')
          }
        }}
      >
        Error action
      </button>
      <p id="action-result">{result}</p>
    </>
  )
}
