'use client'

import { lazy, Suspense } from 'react'
import { Level } from './level'

const X = lazy(() => import('./x'))

export default function A() {
  return (
    <Level name="level-a">
      <Suspense fallback={null}>
        <X />
      </Suspense>
    </Level>
  )
}
