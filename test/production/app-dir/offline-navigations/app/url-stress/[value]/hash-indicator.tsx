'use client'

import { useEffect, useState } from 'react'

export function HashIndicator() {
  const [hash, setHash] = useState('')

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash)
    updateHash()
    window.addEventListener('hashchange', updateHash)

    return () => {
      window.removeEventListener('hashchange', updateHash)
    }
  }, [])

  return <p id="url-stress-hash">url stress hash: {hash}</p>
}
