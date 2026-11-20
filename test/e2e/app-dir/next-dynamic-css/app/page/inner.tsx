'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
const Component = dynamic(() => import('./component'))

export default function Inner() {
  return (
    <Suspense>
      <Component />
    </Suspense>
  )
}
