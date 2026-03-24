'use client'

import { useState } from 'react'

export default function Page() {
  const [clicked, setClicked] = useState(false)
  if (clicked) {
    throw new Error('this is a test')
  }
  return (
    <button
      id="error-trigger-button"
      onClick={() => {
        setClicked(true)
      }}
    >
      Trigger Error!
    </button>
  )
}
