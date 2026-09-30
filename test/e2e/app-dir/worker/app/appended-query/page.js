'use client'
import { useState } from 'react'

export default function Home() {
  const [state, setState] = useState('default')
  return (
    <div>
      <button
        onClick={() => {
          // Some environments (e.g. in-app browsers, link decorators) append a
          // query string to the worker script URL, e.g. `?fbclid=...`.
          const NativeWorker = window.Worker
          window.Worker = class extends NativeWorker {
            constructor(url, options) {
              super(`${String(url)}?fbclid=abc`, options)
            }
          }
          let worker
          try {
            worker = new Worker(new URL('../worker', import.meta.url))
          } finally {
            window.Worker = NativeWorker
          }
          worker.addEventListener('message', (event) => {
            setState(event.data)
          })
        }}
      >
        Get web worker data
      </button>
      <p>Worker state: </p>
      <p id="worker-state">{state}</p>
    </div>
  )
}
