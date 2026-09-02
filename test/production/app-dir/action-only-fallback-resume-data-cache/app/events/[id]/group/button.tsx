'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { notFoundAfterRevalidation, readCachedValue } from './actions'

declare global {
  interface Window {
    retainedAction?: () => Promise<string>
    retainedNotFoundAction?: () => Promise<void>
  }
}

export function Button() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    window.retainedAction = readCachedValue
    window.retainedNotFoundAction = notFoundAfterRevalidation
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
