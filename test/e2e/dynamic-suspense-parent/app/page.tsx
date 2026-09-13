'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

const Heavy = dynamic(() => import('./components/heavy'), { ssr: false })

export default function Page() {
  return (
    <Suspense fallback={<p id="parent-fallback">parent loading...</p>}>
      <div>
        <p id="static-content">header</p>
        <Heavy />
        <p>footer</p>
      </div>
    </Suspense>
  )
}
