'use client'

import { useState } from 'react'

export default function Page() {
  const [first, setFirst] = useState('first idle')
  const [second, setSecond] = useState('second idle')

  return (
    <>
      <button
        id="load-extensionless"
        onClick={async () => setFirst((await import('./target')).value)}
      >
        {first}
      </button>
      <button
        id="load-explicit-extension"
        onClick={async () => setSecond((await import('./target.ts')).value)}
      >
        {second}
      </button>
    </>
  )
}
