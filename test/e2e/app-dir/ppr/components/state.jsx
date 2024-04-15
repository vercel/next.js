'use client'

import { usePathname } from 'next/navigation'
import React from 'react'
import { useCallback } from 'react'

export function Login({ signedIn = false, fallback }) {
  const onClick = useCallback(async () => {
    if (signedIn) {
      await fetch('/api/cookie?name=session', {
        method: 'DELETE',
        credentials: 'same-origin',
      })
    } else {
      await fetch('/api/cookie?name=session', {
        method: 'POST',
        credentials: 'same-origin',
      })
    }

    window.location.reload()
  }, [signedIn])
  const pathname = usePathname()

  return (
    <>
      <pre>pathname: {pathname}</pre>
      <button
        id="login"
        className="bg-gray-400 hover:bg-gray-500 px-4 py-2 text-white rounded-md"
        onClick={onClick}
      >
        {fallback ? 'Sign ..' : signedIn ? 'Sign Out' : 'Sign In'}
      </button>
    </>
  )
}

export function Delay({ active = false, fallback }) {
  const onClick = useCallback(async () => {
    if (active) {
      await fetch('/api/cookie?name=delay', {
        method: 'DELETE',
        credentials: 'same-origin',
      })
    } else {
      await fetch('/api/cookie?name=delay', {
        method: 'POST',
        credentials: 'same-origin',
      })
    }

    window.location.reload()
  }, [active])

  return (
    <>
      <pre>
        delay: {fallback ? 'loading...' : active ? 'enabled' : 'disabled'}
      </pre>
      <button
        id="login"
        className="bg-gray-400 hover:bg-gray-500 px-4 py-2 text-white rounded-md"
        onClick={onClick}
      >
        {fallback ? 'Loading...' : active ? 'Disable Delay' : 'Enable Delay'}
      </button>
    </>
  )
}
