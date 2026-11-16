'use client'

import { useState } from 'react'
import { invalidateFromStream } from './action'

export function ActionButton({ cacheKey }: { cacheKey: string }) {
  const [status, setStatus] = useState('idle')
  async function run() {
    const stream = await invalidateFromStream(cacheKey)
    const reader = stream.getReader()
    for (;;) {
      if ((await reader.read()).done) {
        break
      }
    }
    setStatus('finished')
  }
  return (
    <button id="action" onClick={run}>
      {status}
    </button>
  )
}
