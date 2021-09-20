import React, { Suspense } from 'react'
import dynamic from 'next/dynamic'

// flag for testing
const wrapped = true

const Hello = dynamic(() => import('../../components/hello'), {
  suspense: true,
})

export default function Unwrapped() {
  if (!wrapped) return <Hello />

  return (
    <Suspense fallback={`loading`}>
      <Hello />
    </Suspense>
  )
}
