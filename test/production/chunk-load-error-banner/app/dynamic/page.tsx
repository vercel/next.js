'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const LazyComponent = dynamic(() => import('../../components/lazy-component'), {
  ssr: false,
})

export default function DynamicPage() {
  return (
    <div id="dynamic-page-content">
      <h2>Dynamic Page</h2>
      <p>This page has a dynamically loaded component below:</p>
      <Suspense fallback={<div id="loading">Loading lazy component...</div>}>
        <LazyComponent />
      </Suspense>
    </div>
  )
}
