'use client'

import { useEffect, useState } from 'react'

export function OtherProbe() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return <span id="other-probe">{mounted ? 'mounted' : 'pending'}</span>
}
