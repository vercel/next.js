'use client'

import { useEffect, useState } from 'react'

export default function ClientEntry() {
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState('not loaded')
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(new URL('./pwa', import.meta.url))
    }
  }, [])
  return (
    <>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      <button
        onClick={() =>
          import('./lazy').then((module) => setMessage(module.message))
        }
      >
        Load on demand
      </button>
      <span>{message}</span>
    </>
  )
}
