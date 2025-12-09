import { Suspense } from 'react'

// Cached component that awaits params promise - triggers dynamic IO
async function DynamicContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  'use cache'
  const { slug } = await params
  await new Promise((resolve) => setTimeout(resolve, 100))
  return (
    <div data-testid="dynamic-content">
      <p>Loaded content for: {slug}</p>
    </div>
  )
}

// Static cached content that doesn't depend on params
async function StaticHeader() {
  'use cache'
  return (
    <header data-testid="static-header">
      <h1>Item Details</h1>
      <p>This header is static and can be prerendered</p>
    </header>
  )
}

export default function ItemPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div data-testid="item-page-root">
      {/* Static cached part - can be prerendered */}
      <Suspense
        fallback={<div data-testid="header-loading">Loading header...</div>}
      >
        <StaticHeader />
      </Suspense>

      {/* Dynamic part - params promise unpacked under Suspense boundary */}
      <main>
        <Suspense
          fallback={
            <div data-testid="param-loading">Loading item details...</div>
          }
        >
          <DynamicContent params={params} />
        </Suspense>
      </main>

      {/* Another static section */}
      <footer data-testid="static-footer">
        <p>Static footer content</p>
      </footer>
    </div>
  )
}
