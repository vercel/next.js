'use client'

import { lazy, Suspense } from 'react'
import { Level } from './level'

const Y = lazy(() => import('./y'))

export default function B() {
  return (
    <Level name="level-b">
      <Suspense fallback={null}>
        <Y />
      </Suspense>
    </Level>
  )
}
