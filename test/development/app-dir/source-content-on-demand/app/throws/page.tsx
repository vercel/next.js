'use client'

import { useEffect } from 'react'

export default function ThrowsPage() {
  useEffect(() => {
    // Surface a client-side error whose original stack frame should trace back
    // to this project file even though the source map serves content on demand.
    throw new Error('boom from throws page')
  }, [])
  return <p id="throws">throws</p>
}
