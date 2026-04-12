'use client'
import { useEffect, useState } from 'react'

export default function Home() {
  const [state, setState] = useState('default')
  useEffect(() => {
    const worker = new Worker(new URL('./worker', import.meta.url))
    worker.addEventListener('message', (event) => {
      setState(String(event.data))
    })
    return () => worker.terminate()
  }, [])
  return (
    <div>
      <p>Worker state:</p>
      <p id="worker-state">{state}</p>
    </div>
  )
}
