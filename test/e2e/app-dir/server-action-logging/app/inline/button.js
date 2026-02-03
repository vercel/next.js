'use client'

import { useState } from 'react'

export function InlineActionButton({ action }) {
  const [result, setResult] = useState(null)

  const handleClick = async () => {
    const res = await action(10)
    setResult(res)
  }

  return (
    <div>
      <button id="true-inline-action" onClick={handleClick}>
        True Inline Action
      </button>
      {result && <pre id="result">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  )
}
