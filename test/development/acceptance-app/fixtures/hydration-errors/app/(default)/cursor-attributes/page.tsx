'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <main id="cursor-attributes" data-hydrated={hydrated}>
      <h1>Page title</h1>
      <p id="injected">First line</p>
      <p id="declared" data-cursor-ref="app-owned">
        Second line
      </p>
      <p id="declared-null" data-cursor-ref={null}>
        Third line
      </p>
    </main>
  )
}
