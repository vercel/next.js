'use client'
import { useEffect } from 'react'

// Marks shell hydration for the client-trace harness. Effects flush after
// the initial hydration commit, so this measures the shell, not streamed
// Suspense content that hydrates later.
export default function HydrationMark() {
  useEffect(() => {
    performance.mark('bench:hydrated')
  }, [])
  return null
}
