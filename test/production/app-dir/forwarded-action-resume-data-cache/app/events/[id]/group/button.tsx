'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { readCachedValue } from './actions'

declare global {
  interface Window {
    forwardedAction?: () => Promise<string>
  }
}

export function Button() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    window.forwardedAction = readCachedValue
    setReady(true)
  }, [])

  return (
    <>
      <p id="action-ready">{ready ? 'ready' : 'loading'}</p>
      <Link id="navigate-home" href="/">
        navigate home
      </Link>
    </>
  )
}
