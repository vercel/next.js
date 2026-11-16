'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const Lazy = dynamic(() => import('./lazy'))

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <>
      <button onClick={() => setCount(count + 1)}>{count}</button>
      <Lazy />
    </>
  )
}
