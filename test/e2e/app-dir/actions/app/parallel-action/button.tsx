'use client'

import { useState } from 'react'

export function ActionButton({
  action,
  id,
}: {
  action: () => Promise<string>
  id: string
}) {
  const [result, setResult] = useState('<null>')

  return (
    <>
      <button id={id} onClick={async () => setResult(await action())}>
        Invoke action
      </button>
      <p id={`${id}-result`}>{result}</p>
    </>
  )
}
