'use client'

import { useEffect, useState } from 'react'

export default function ClientComponent() {
  const [workerUrl, setWorkerUrl] = useState<string>('')
  const [workerLocation, setWorkerLocation] = useState<string>('')

  useEffect(() => {
    const url = new URL('./worker.ts', import.meta.url)
    setWorkerUrl(url.toString())

    const worker = new Worker(url)
    worker.onmessage = (event) => {
      setWorkerLocation(String(event.data))
    }

    return () => worker.terminate()
  }, [])

  return (
    <>
      <p>worker constructor URL (as seen by main thread):</p>
      <pre id="worker-url">{workerUrl}</pre>
      <p>worker self.location.href (posted from worker):</p>
      <pre id="worker-location">{workerLocation}</pre>
    </>
  )
}
