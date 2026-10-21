'use client'

import { useState } from 'react'
import { sharedValue } from './shared'

export default function Page() {
  const [response, setResponse] = useState('idle')

  function start(worker: Worker) {
    setResponse('waiting')
    worker.onmessage = (event: MessageEvent<string>) => {
      setResponse(event.data)
      worker.terminate()
    }
    worker.onerror = (event) => {
      setResponse(`error: ${event.message}`)
      worker.terminate()
    }
    worker.postMessage('ping')
  }

  return (
    <>
      <p id="shared">{sharedValue}</p>
      <p id="response">{response}</p>
      <button
        id="inline"
        onClick={() =>
          start(new Worker(new URL('./worker.js', import.meta.url)))
        }
      >
        Spawn co-located worker
      </button>
      <button
        id="separate"
        onClick={() =>
          start(new Worker(new URL('../modules/w1.js', import.meta.url)))
        }
      >
        Spawn separate worker module
      </button>
    </>
  )
}
