'use client'

import { usePathname } from 'next/navigation'
import { Suspense } from 'react'

function Pathname() {
  return <p>pathname: {usePathname()}</p>
}

export function ShowPathname() {
  return (
    <Suspense fallback={null}>
      <Pathname />
    </Suspense>
  )
}
