'use client'

import { useParams } from 'next/navigation'
import { Suspense } from 'react'

type Params = { slug: string }

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <Inner />
      </Suspense>
    </main>
  )
}

function Inner() {
  const { slug } = useParams<Params>()
  return <p>Slug: {slug}</p>
}
