'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const DynamicTarget = dynamic(() => import('./dynamic-target'))

export default function ClientEntry() {
  const [count, setCount] = useState(0)
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
    </>
  )
}
