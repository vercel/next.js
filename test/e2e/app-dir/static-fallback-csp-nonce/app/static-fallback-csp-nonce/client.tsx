'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'

export function Client() {
  const params = useParams()
  const [count, setCount] = useState(0)
  return (
    <>
      <p id="params">{JSON.stringify(params)}</p>
      <button id="counter" onClick={() => setCount(count + 1)}>
        {count}
      </button>
    </>
  )
}
