'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
  }, [])

  return (
    <button id="counter" onClick={() => setCount((value) => value + 1)}>
      Count: {count}
    </button>
  )
}
