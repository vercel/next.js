'use client'

import { useState } from 'react'

function preventUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
}

export function BeforeUnloadToggle() {
  const [isBlocking, setIsBlocking] = useState(false)

  return (
    <button
      id="toggle-before-unload"
      onClick={() => {
        if (isBlocking) {
          window.removeEventListener('beforeunload', preventUnload)
        } else {
          window.addEventListener('beforeunload', preventUnload)
        }
        setIsBlocking(!isBlocking)
      }}
    >
      {isBlocking ? 'Allow unload' : 'Block unload'}
    </button>
  )
}
