'use client'

import { useEffect, useState } from 'react'

export default function ClientEntry() {
  const [message, setMessage] = useState('not loaded')
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(new URL('./pwa', import.meta.url))
    }
  }, [])
  return (
    <>
      <button
        onClick={() =>
          import('./lazy').then((module) => setMessage(module.message))
        }
      >
        Load on demand
      </button>
      <button
        onClick={() =>
          import('./merged-reexport').then((module) =>
            setMessage(module.reexportedMessage())
          )
        }
      >
        Load reexport
      </button>
      <span>{message}</span>
    </>
  )
}
