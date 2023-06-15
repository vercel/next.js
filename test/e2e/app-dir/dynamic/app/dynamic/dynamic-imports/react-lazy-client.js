'use client'

import { useState, lazy } from 'react'

const Lazy = lazy(() => import('../text-lazy-client'))

export function LazyClientComponent() {
  let [state] = useState('use client')
  return (
    <>
      <Lazy />
      <p className="hi">next-dynamic {state}</p>
    </>
  )
}
