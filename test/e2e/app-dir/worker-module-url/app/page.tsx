'use client'

import { useState } from 'react'

export default function Page() {
  const [status, setStatus] = useState('idle')

  function startWorker() {
    try {
      const worker = new Worker(
        new URL('worker-package/worker.js', import.meta.url)
      )
      worker.onmessage = ({ data }) => {
        setStatus(data)
        worker.terminate()
      }
      worker.onerror = ({ message }) => {
        setStatus(message)
        worker.terminate()
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <main>
      <button onClick={startWorker}>Start worker</button>
      <p id="status">{status}</p>
    </main>
  )
}
