'use client'

import { useState } from 'react'
import { getGreeting } from './actions'

export default function Page() {
  const [result, setResult] = useState('initial')

  return (
    <>
      <button
        id="invoke-action"
        onClick={async () => {
          setResult(await getGreeting())
        }}
      >
        invoke action
      </button>
      <p id="result">{result}</p>
    </>
  )
}
