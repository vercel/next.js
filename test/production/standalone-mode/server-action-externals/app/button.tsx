'use client'

import { useState } from 'react'
import { doStuff } from './actions'

export function Button() {
  const [result, setResult] = useState('')
  return (
    <>
      <button onClick={async () => setResult(await doStuff())}>go</button>
      <p id="result">{result}</p>
    </>
  )
}
