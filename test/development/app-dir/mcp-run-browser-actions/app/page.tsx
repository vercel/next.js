'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [name, setName] = useState('')
  const [greeting, setGreeting] = useState('')
  const [hydrated, setHydrated] = useState(false)

  // Keep the button disabled until React has hydrated, so scripted clicks
  // never run before the handler is attached.
  useEffect(() => setHydrated(true), [])

  return (
    <main>
      <h1>Browser actions</h1>
      <input
        id="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button
        id="greet"
        disabled={!hydrated}
        onClick={() => setGreeting(`Hello, ${name}!`)}
      >
        Greet
      </button>
      <p id="greeting">{greeting}</p>
      <a id="external" href="http://127.0.0.1:59999/outside">
        External
      </a>
    </main>
  )
}
