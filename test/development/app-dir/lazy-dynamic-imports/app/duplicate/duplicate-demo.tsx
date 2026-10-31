'use client'

import { useState } from 'react'
import { loadTarget } from './load-target'

export function DuplicateDemo() {
  const [first, setFirst] = useState('first idle')
  const [second, setSecond] = useState('second idle')
  const [third, setThird] = useState('third idle')

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
      <button
        id="load-third"
        onClick={async () => setThird(await loadTarget())}
      >
        {third}
      </button>
    </>
  )
}
