'use client'

import { useState } from 'react'
import { inc } from '../../client/actions'

export function Button() {
  const [count, setCount] = useState(0)

  return (
    <>
      <p id="count">{count}</p>
      <button
        id="inc"
        onClick={async () => {
          const newCount = await inc(count)
          setCount(newCount)
        }}
      >
        click me
      </button>
    </>
  )
}
