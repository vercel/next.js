'use client'

import { useState } from 'react'
import { run } from './actions'

export default function Page() {
  const [result, setResult] = useState('')
  return (
    <>
      <button onClick={async () => setResult(await run())}>run</button>
      <p id="result">{result}</p>
    </>
  )
}
