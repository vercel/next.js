'use client'
import { useState } from 'react'

export default function Home() {
  const [state, setState] = useState('default')
  return (
    <div>
      <button
        onClick={() => {
          const worker = new Worker(new URL('./worker', import.meta.url))
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
