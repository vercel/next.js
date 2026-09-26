'use client'

import { useEffect, useState } from 'react'

// Loads the singleton probe lazily so the remote page's client bundle keeps
// the shared-module initializer reachable for the host.
export function RemoteSingletonLoader() {
  const [Component, setComponent] = useState(null)
  useEffect(() => {
    let cancelled = false
    import('./remote-singleton').then((mod) => {
      if (!cancelled) {
        setComponent(() => mod.RemoteSingleton)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (Component === null) {
    return null
  }
  return <Component />
}
