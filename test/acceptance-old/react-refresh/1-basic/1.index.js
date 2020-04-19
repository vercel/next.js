import { useState, useCallback } from 'react'

export default function Index() {
  const [count, setCount] = useState(0)
  const increment = useCallback(() => {
    setCount(c => c + 1)
  }, [setCount])

  return (
    <main>
      <p id="text">This is a sentence with a typo.</p>
      <p id="count">{count}</p>
      <button id="increment" type="button" onClick={increment}>
        Increment
      </button>
    </main>
  )
}
