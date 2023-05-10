'use client'

import { useReducer } from 'react'

export function Counter() {
  const [count, increment] = useReducer((c, _) => c + 1, 0)
  return (
    <>
      <div>Count: {count}</div>
      <div>
        <button onClick={increment}>Increment</button>
      </div>
    </>
  )
}
