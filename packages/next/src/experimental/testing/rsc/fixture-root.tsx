'use client'

import { useEffect, useState, type ReactNode } from 'react'

/** Private harness boundary. Its effect proves the real client runtime mounted. */
export default function FixtureRoot({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])
  return (
    <div data-next-test-root="" data-next-test-hydrated={String(hydrated)}>
      {children}
    </div>
  )
}
