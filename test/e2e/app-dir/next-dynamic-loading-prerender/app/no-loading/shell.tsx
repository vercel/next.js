'use client'

import dynamic from 'next/dynamic'

// No `loading` option, so `next/dynamic` does not create a Suspense boundary
// of its own.
const Heavy = dynamic(() => import('../heavy'))

export function Shell() {
  return (
    <main>
      <p id="shell">shell</p>
      <Heavy />
    </main>
  )
}
