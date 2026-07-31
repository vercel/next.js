'use client'

import { useState, useTransition } from 'react'

import { clientDispatchedCachedFunction } from './cached'

export function ServerActionControls({
  trackedServerAction,
}: {
  trackedServerAction: (argument: string) => Promise<string>
}) {
  const [result, setResult] = useState('idle')
  const [, startTransition] = useTransition()

  return (
    <>
      <button
        id="run-tracked-server-action"
        type="button"
        onClick={() => {
          startTransition(async () => {
            setResult(
              await trackedServerAction('private-server-action-argument')
            )
          })
        }}
      >
        Run Server Action
      </button>
      <button
        id="run-client-cached-function"
        type="button"
        onClick={() => {
          startTransition(async () => {
            setResult(await clientDispatchedCachedFunction())
          })
        }}
      >
        Run cached function
      </button>
      <p id="server-action-result">{result}</p>
    </>
  )
}
