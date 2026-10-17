'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const DynamicTarget = dynamic(() => import('./dynamic-target'))

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
        onClick={async () => {
          const { asyncValue } = await import('./async-target')
          setCount(asyncValue)
        }}
      >
        Load async target
      </button>
      <DynamicTarget />
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
