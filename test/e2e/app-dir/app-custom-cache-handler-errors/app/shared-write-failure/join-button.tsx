'use client'

import { useState } from 'react'

export function JoinButton({
  joinFillAction,
}: {
  joinFillAction: () => Promise<string>
}) {
  const [result, setResult] = useState('')
  return (
    <>
      <button
        id="join-fill"
        onClick={async () => {
          try {
            setResult(await joinFillAction())
          } catch {
            setResult('action failed')
          }
        }}
      >
        Join fill
      </button>
      <p id="shared-write-result">{result}</p>
    </>
  )
}
