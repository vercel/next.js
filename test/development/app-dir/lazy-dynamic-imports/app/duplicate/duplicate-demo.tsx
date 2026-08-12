'use client'

import { useState } from 'react'

export function DuplicateDemo() {
  const [first, setFirst] = useState('first idle')
  const [second, setSecond] = useState('second idle')

  return (
    <>
      <button
        id="load-first"
        onClick={async () => setFirst((await import('./target')).value)}
      >
        {first}
      </button>
      <button
        id="load-second"
        onClick={async () => setSecond((await import('./target')).value)}
      >
        {second}
      </button>
    </>
  )
}
