'use client'

import { useState } from 'react'
import { streamData } from './actions'

export default function Page() {
  const [chunks, setChunks] = useState<string[] | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)

  const handleClick = async () => {
    setChunks(null)
    setIsStreaming(true)

    const stream = await streamData(window.location.origin)
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        const chunk = decoder.decode(value, { stream: true })
        setChunks((prev) => (prev ? [...prev, chunk] : [chunk]))
      }
    } finally {
      reader.releaseLock()
      setIsStreaming(false)
    }
  }

  return (
    <div>
      <button disabled={isStreaming} onClick={handleClick} id="stream-button">
        {isStreaming ? 'Streaming...' : 'Start Stream'}
      </button>

      {chunks && (
        <>
          <h3>Received {chunks.length} chunks</h3>
          <ol id="chunks">
            {chunks.map((chunk, i) => (
              <li key={i}>{chunk}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
