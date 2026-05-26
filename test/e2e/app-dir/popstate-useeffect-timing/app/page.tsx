'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function Page() {
  const [effectFired, setEffectFired] = useState(false)

  useEffect(() => {
    setEffectFired(true)
  }, [])

  return (
    <div>
      <h1>Home Page</h1>
      <p id="effect-status">
        {effectFired ? 'effect-fired' : 'effect-pending'}
      </p>
      <Link href="/navigation-target">Go to target</Link>
    </div>
  )
}
