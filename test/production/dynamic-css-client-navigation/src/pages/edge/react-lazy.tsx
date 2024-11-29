import React, { lazy, Suspense } from 'react'

const ReactLazyRedButton = lazy(() =>
  import('../../components/red-button').then((module) => ({
    default: module.RedButton,
  }))
)

export default function ReactLazy() {
  return (
    <Suspense fallback={null}>
      <ReactLazyRedButton />
    </Suspense>
  )
}
