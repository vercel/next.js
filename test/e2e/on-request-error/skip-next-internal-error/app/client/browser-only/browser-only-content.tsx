'use client'

import { Suspense, use } from 'react'
import { browserOnly } from 'next/navigation'

function Content() {
  use(browserOnly())
  return <p>browser content</p>
}

export function BrowserOnlyContent() {
  return (
    <Suspense fallback={<p>browser fallback</p>}>
      <Content />
    </Suspense>
  )
}
