'use client'

import { useState } from 'react'

export function Button() {
  const [clicked, setClicked] = useState(false)
  return (
    <button onClick={() => setClicked(true)}>
      {clicked ? 'clicked' : 'client component'}
    </button>
  )
}
