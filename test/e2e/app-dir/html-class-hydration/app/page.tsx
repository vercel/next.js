'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function Page() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    // Runs after hydration + the dev-only StrictMode double-invoke of effects.
    // By the time this commits, any post-hydration reset of <html> has happened.
    setHydrated(true)
  }, [])
  return (
    <main>
      <p id="home">home</p>
      {hydrated ? <span id="hydrated" /> : null}
      <Link href="/second" id="to-second">
        to second
      </Link>
    </main>
  )
}
