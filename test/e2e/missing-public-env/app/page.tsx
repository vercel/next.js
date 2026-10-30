'use client'

import { useState } from 'react'
import { readEnv, debugMessage } from '../lib/env'

export default function Page() {
  const [result, setResult] = useState('')
  return (
    <>
      <button
        data-key="NEXT_PUBLIC_MISSING_ENV_TEST"
        onClick={(event) => {
          const key = event.currentTarget.dataset.key!
          process.env[key] = 'browser-runtime-value'
          try {
            setResult(
              JSON.stringify({ ...readEnv(), runtime: process.env[key] })
            )
          } finally {
            delete process.env[key]
          }
        }}
      >
        Read env
      </button>
      <pre id="result">{result}</pre>
      <p>{debugMessage()}</p>
    </>
  )
}
