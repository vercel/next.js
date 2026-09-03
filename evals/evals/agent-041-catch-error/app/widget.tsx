'use client'

import { useState } from 'react'

export default function Widget() {
  const [clicked, setClicked] = useState(false)
  if (clicked) {
    throw new Error('Widget failed to load')
  }
  return (
    <div>
      <h2>Widget</h2>
      <button onClick={() => setClicked(true)}>Load data</button>
    </div>
  )
}
