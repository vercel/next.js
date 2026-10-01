'use client'

import { useState } from 'react'

export default function AddedClient() {
  const [count, setCount] = useState(0)
  return (
    <button onClick={() => setCount(count + 1)}>Added client: {count}</button>
  )
}
