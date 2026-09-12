'use client'

import { useState } from 'react'
import { double } from './actions'

export default function Page() {
  const [result, setResult] = useState('initial')
  const [error, setError] = useState('none')

  return (
    <>
      <p id="result">{result}</p>
      <p id="error">{error}</p>
      <button
        id="run"
        onClick={async () => {
          try {
            setResult(String(await double(1)))
          } catch (err) {
            setError(String(err))
          }
        }}
      >
        run action
      </button>
    </>
  )
}
