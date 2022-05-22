import React, { Suspense } from 'react'
import dynamic from 'next/dynamic'

const Foo = dynamic(() => import('../components/foo'), { suspense: true })

export default function Dynamic() {
  return (
    <Suspense>
      <Foo />
    </Suspense>
  )
}
