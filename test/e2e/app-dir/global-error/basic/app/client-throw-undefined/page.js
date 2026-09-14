'use client'

import { useState } from 'react'

export default function Page() {
  const [clicked, setClicked] = useState(false)
  if (clicked) {
    // eslint-disable-next-line no-throw-literal -- testing bad values on purpose
    throw undefined
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
