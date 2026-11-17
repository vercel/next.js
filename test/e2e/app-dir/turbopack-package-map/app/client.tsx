'use client'

import { useEffect, useState } from 'react'
import value from 'client-lib'

export function ClientValue() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return <p id="client">{hydrated ? `hydrated ${value}` : value}</p>
}
