import { useState } from 'react'

export function Counter({ initialCount }) {
  const [count, setCount] = useState(initialCount)
  const doubled = count * 2
  return (
    <div>
      <p>{count}</p>
      <p>{doubled}</p>
      <button onClick={() => setCount(count + 1)}>increment</button>
    </div>
  )
}
