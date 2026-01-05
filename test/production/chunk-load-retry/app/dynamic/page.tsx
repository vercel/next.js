'use client'

import dynamic from 'next/dynamic'

const LazyComponent = dynamic(() => import('../../components/lazy-component'), {
  loading: () => <div data-testid="loading">Loading...</div>,
  ssr: false,
})

export default function DynamicPage() {
  return (
    <main>
      <h1>Dynamic Page</h1>
      <LazyComponent />
    </main>
  )
}
