'use client'

import { useState } from 'react'

type Action = (value: string) => Promise<string>

export function Client({
  action,
  declaredAction,
}: {
  action: Action
  declaredAction: Action
}) {
  const [result, setResult] = useState('')
  const [declaredResult, setDeclaredResult] = useState('')

  return (
    <>
      <button
        id="run-action"
        onClick={async () => setResult(await action('client'))}
      >
        Run action
      </button>
      <p id="action-result">{result}</p>
      <button
        id="run-declared-action"
        onClick={async () => setDeclaredResult(await declaredAction('client'))}
      >
        Run declared action
      </button>
      <p id="declared-action-result">{declaredResult}</p>
    </>
  )
}
