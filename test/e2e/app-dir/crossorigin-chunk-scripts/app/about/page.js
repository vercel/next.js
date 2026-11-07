'use client'

import { useState } from 'react'

export default function Page() {
  const [count, setCount] = useState(0)
  return (
    <button id="about" onClick={() => setCount(count + 1)}>
      About {count}
    </button>
  )
}
