'use client'

import { lazy, Suspense, useEffect, useState } from 'react'

const ProductInfo = lazy(() => import('./product-info'))

export function ClientContent({ title }: { title: string }) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => setIsMounted(true), [])

  return (
    <Suspense fallback={<p id="client-fallback">Loading client content</p>}>
      {isMounted ? (
        <ProductInfo title={title} />
      ) : (
        <p id="client-pending">Waiting for hydration</p>
      )}
    </Suspense>
  )
}
