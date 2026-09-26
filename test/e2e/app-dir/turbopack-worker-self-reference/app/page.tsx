'use client'

import { useState } from 'react'
import { sharedValue } from './shared'
import './loaded.css'

declare const __turbopack_get_loaded_chunk_paths__: (() => string[]) | undefined

export default function Page() {
  const [response, setResponse] = useState('idle')
  const [loadedChunks, setLoadedChunks] = useState('')

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
      <p id="loaded-chunk-paths">{loadedChunks}</p>
      <button
        id="inspect-chunks"
        onClick={() =>
          setLoadedChunks(
            typeof __turbopack_get_loaded_chunk_paths__ === 'function'
              ? __turbopack_get_loaded_chunk_paths__().join(',')
              : 'unavailable'
          )
        }
      >
        Inspect loaded chunks
      </button>
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
