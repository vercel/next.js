'use client'

import { lazy, Suspense } from 'react'
import { Level } from './level'

const X = lazy(() => import('./x'))

export default function Y() {
  return (
    <Level name="level-y">
      <Suspense fallback={null}>
        <X />
      </Suspense>
    </Level>
  )
}
