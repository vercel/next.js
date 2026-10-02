'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [state, setState] = useState('default')

  useEffect(() => {
    const worker = new Worker(new URL('./worker', import.meta.url))
    worker.addEventListener('message', (event) => setState(event.data))
    return () => worker.terminate()
  }, [])

  return <p id="worker-state">{state}</p>
}
