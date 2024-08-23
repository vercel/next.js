'use client'

import { usePathname } from 'next/navigation'
import { Suspense, use } from 'react'

function Dynamic() {
  const pathname = usePathname()

  use(new Promise((resolve) => setTimeout(resolve, 1000)))

  return <div data-slug={pathname}>{pathname}</div>
}

export default function Page() {
  return (
    <Suspense fallback={<div data-fallback>Dynamic Loading...</div>}>
      <Dynamic />
    </Suspense>
  )
}
