'use client'
import { useEffect, useState } from 'react'

export function HydrationIndicator({ id }: { id?: string }) {
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])
  return (
    <div id={id} data-is-hydrated={isMounted ? 'true' : 'false'}>
      {isMounted ? '🟢 Hydrated' : '⚪ Not hydrated yet'}
    </div>
  )
}
