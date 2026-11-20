'use client'

import { useEffect, useState } from 'react'

export function Slot() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return <p>{mounted ? 'mounted' : 'slot'}</p>
}
