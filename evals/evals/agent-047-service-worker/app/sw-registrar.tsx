'use client'

import { useEffect } from 'react'

export function SwRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // BROKEN: /sw.js is never emitted by the build, so this 404s.
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
    }
  }, [])
  return null
}
