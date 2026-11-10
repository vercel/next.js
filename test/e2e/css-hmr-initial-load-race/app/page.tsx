'use client'

import { useState } from 'react'

export default function Page() {
  const [count, setCount] = useState(0)

  return (
    <>
      <p className="race-target race-added">hello</p>
      <button id="counter" onClick={() => setCount(count + 1)}>
        {count}
      </button>
    </>
  )
}
