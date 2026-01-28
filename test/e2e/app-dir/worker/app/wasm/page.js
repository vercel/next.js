'use client'
import { useState } from 'react'

export default function WasmWorkerPage() {
  const [state, setState] = useState('default')

  return (
    <div>
      <button
        onClick={() => {
          const worker = new Worker(new URL('../wasm-worker', import.meta.url))
          worker.addEventListener('message', (event) => {
            if (event.data.success) {
              setState(`result:${event.data.result}`)
            } else {
              setState(`error:${event.data.error}`)
            }
          })
        }}
      >
        Load WASM in worker
      </button>
      <p>Worker state: </p>
      <p id="worker-state">{state}</p>
    </div>
  )
}
