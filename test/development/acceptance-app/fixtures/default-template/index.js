'use client'
import { useCallback, useState } from 'react'

export default function Index() {
  const [count, setCount] = useState(0)
  const increment = useCallback(() => setCount((c) => c + 1), [setCount])
  return (
    <main>
      <p>{count}</p>
      <button onClick={increment}>Increment</button>
    </main>
  )
}
// export default () => 'new sandbox'
