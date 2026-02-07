'use client'

import { useState } from 'react'
import { testBunExternals } from './actions'

export default function ServerActionPage() {
  const [result, setResult] = useState('')

  async function handleClick() {
    const res = await testBunExternals()
    setResult(res)
  }

  return (
    <div>
      <h1>Server Action Test</h1>
      <button id="test-action" onClick={handleClick}>
        Test Bun Externals in Server Action
      </button>
      {result && <div id="action-result">{result}</div>}
    </div>
  )
}
