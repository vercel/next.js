import { useState } from 'react'

export default function Page() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <h1>pages shared runtime csp</h1>
      <p id="count">count: {count}</p>
      <button id="increment" onClick={() => setCount((c) => c + 1)}>
        increment
      </button>
    </div>
  )
}
