'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Suspense } from 'react'

const Async = dynamic(() => import('./async'), { ssr: false })

export default function Page() {
  return (
    <>
      <Link href="/other" id="to-other" prefetch={false}>
        to other
      </Link>
      <Suspense fallback={<div>Loading...</div>}>
        <Async />
      </Suspense>
    </>
  )
}
