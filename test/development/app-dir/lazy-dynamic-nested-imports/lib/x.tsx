'use client'

import { lazy, Suspense } from 'react'
import { Level } from './level'

const X2 = lazy(() => import('./x2'))

export default function X() {
  return (
    <Level name="level-x">
      <Suspense fallback={null}>
        <X2 />
      </Suspense>
    </Level>
  )
}
