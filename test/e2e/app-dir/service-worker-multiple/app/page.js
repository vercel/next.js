'use client'
import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    // Registering two different service-worker files is unsupported: a single app
    // serves one worker at /sw.js, so this must fail the build.
    navigator.serviceWorker.register(new URL('../lib/pwa-a', import.meta.url))
    navigator.serviceWorker.register(new URL('../lib/pwa-b', import.meta.url))
  }, [])
  return <p id="page">multiple service workers</p>
}
