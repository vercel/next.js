'use client'

import { lazy, Suspense } from 'react'
import { Level } from './level'

const X = lazy(() => import('./x'))

export default function C() {
  return (
    <Level name="level-c">
      <Suspense fallback={null}>
        <X />
      </Suspense>
    </Level>
  )
}
