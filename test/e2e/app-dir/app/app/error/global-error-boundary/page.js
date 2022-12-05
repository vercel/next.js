'use client'

import { useState } from 'react'

export default function Page() {
  const [clicked, setClicked] = useState(false)
  if (clicked) {
    const e = new Error('this is a test')
    e.digest = 'CUSTOM_DIGEST'
    throw e
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
