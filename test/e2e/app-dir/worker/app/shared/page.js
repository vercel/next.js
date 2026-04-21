'use client'
import { useState } from 'react'

export default function Home() {
  const [state, setState] = useState('default')
  return (
    <div>
      <button
        onClick={() => {
          try {
            const worker = new SharedWorker(
              new URL('../shared-worker', import.meta.url),
              {
                type: 'module',
              }
            )
            worker.onerror = (event) => {
              setState(
                'worker-error:' + (event.message || event.type || 'unknown')
              )
            }
            worker.port.addEventListener('message', (event) => {
              setState(event.data)
              // Run a second time, which will use the same worker
              const worker = new SharedWorker(
                new URL('../shared-worker', import.meta.url),
                {
                  type: 'module',
                }
              )
              worker.onerror = (event) => {
                setState(
                  'worker-error2:' + (event.message || event.type || 'unknown')
                )
              }
              worker.port.addEventListener('message', (event) => {
                setState(event.data)
              })
              worker.port.start()
            })
            worker.port.start()
          } catch (e) {
            setState('catch-error:' + e.message)
          }
        }}
      >
        Get web worker data
      </button>
      <p>Worker state: </p>
      <p id="worker-state">{state}</p>
    </div>
  )
}
