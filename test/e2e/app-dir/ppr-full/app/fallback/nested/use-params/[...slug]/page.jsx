'use client'

import { useParams } from 'next/navigation'
import { Suspense, use } from 'react'

function Dynamic() {
  const params = useParams()

  use(new Promise((resolve) => setTimeout(resolve, 1000)))

  return <div data-slug={params.slug.join('/')}>{params.slug.join('/')}</div>
}

export default function Page() {
  return (
    <Suspense fallback={<div data-fallback>Dynamic Loading...</div>}>
      <Dynamic />
    </Suspense>
  )
}
