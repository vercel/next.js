'use client'

import { lazy, Suspense, useState } from 'react'

const Lazy = lazy(() => import('./Lazy'))

export default function LoadLazy() {
  const [isLoaded, setIsLoaded] = useState(false)

  return (
    <>
      <button id="load-lazy" onClick={() => setIsLoaded(true)}>
        Load lazy content
      </button>
      {isLoaded && (
        <Suspense fallback="Loading...">
          <Lazy />
        </Suspense>
      )}
    </>
  )
}
