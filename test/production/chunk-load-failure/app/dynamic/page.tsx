'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const Async = dynamic(() => import('./async'), { ssr: false })

export default function Page() {
  return (
    <>
      <Suspense fallback={<div>Loading...</div>}>
        <Async />
      </Suspense>
    </>
  )
}
