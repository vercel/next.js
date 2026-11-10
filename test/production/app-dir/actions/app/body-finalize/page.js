'use client'

import { useMemo, useState } from 'react'
import { submitLargePayload } from './actions'

export default function Page() {
  const [result, setResult] = useState(null)

  const largePayload = useMemo(
    () => new Array(10 * 1024).fill(null).map((_, idx) => idx),
    []
  )

  const handleSubmit = async () => {
    const res = await submitLargePayload(largePayload)
    setResult(res)
  }

  return (
    <div>
      <button onClick={handleSubmit} id="submit-large">
        Submit Large Payload
      </button>
      {result && <div id="result">{JSON.stringify(result)}</div>}
    </div>
  )
}
