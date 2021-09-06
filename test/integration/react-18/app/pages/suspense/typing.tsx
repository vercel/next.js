import React, { Suspense } from 'react'
import dynamic from 'next/dynamic'

const DynamicFoo = dynamic(() => import('../../components/ts-foo'), {
  suspense: true,
})

export default function Typing() {
  return (
    <Suspense fallback={null}>
      <DynamicFoo />
    </Suspense>
  )
}
