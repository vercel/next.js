'use client'

import { useEffect, useState } from 'react'

const target = '__TARGET__'

export default function ClientTarget() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return <p id="client-target">{mounted ? JSON.stringify(target) : ''}</p>
}
