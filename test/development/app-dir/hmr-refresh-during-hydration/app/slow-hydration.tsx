'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

export function HydrationStatus() {
  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
  return <p id="status">{isHydrated ? 'hydrated' : 'hydrating'}</p>
}

// Each block holds the main thread for 20ms. React yields between them, so
// hydration takes a few seconds and the HMR update sent by the test arrives
// while the page is still hydrating.
function Block() {
  if (typeof window !== 'undefined') {
    const end = performance.now() + 20
    while (performance.now() < end) {}
  }
  return null
}

export function SlowHydration() {
  return Array.from({ length: 100 }, (_, i) => <Block key={i} />)
}
