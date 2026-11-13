'use client'

import { useState } from 'react'

// Calls `import()` anew on every press: nothing caches the promise, so a press
// after a failed load only succeeds if the runtime retries the chunk load.
function loadAsync() {
  return import('./async')
}

export default function Page() {
  const [status, setStatus] = useState('idle')

  return (
    <>
      <button
        id="load"
        onClick={() => {
          setStatus('loading')
          loadAsync().then(
            (mod) => setStatus(mod.default()),
            (error: Error) => setStatus(`${error.name}: ${error.message}`)
          )
        }}
      >
        Load
      </button>
      <p id="status">{status}</p>
    </>
  )
}
