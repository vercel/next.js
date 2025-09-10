'use client'

import { useEffect } from 'react'

export default function ClientComponent() {
  useEffect(() => {
    new Worker(new URL('./worker.tsx', import.meta.url))
  }, [])

  return <p>This is a client component</p>
}
