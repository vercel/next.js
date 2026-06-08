import { Suspense } from 'react'
import { connection } from 'next/server'

/**
 * Page that accesses only category (not itemId) in the static portion.
 *
 * Combined with the layout (which accesses both params), this tests that
 * vary params are tracked per-segment in runtime prefetches:
 * - Layout varies on both category AND itemId → re-fetched when either changes
 * - Page varies only on category → cached when only itemId changes
 */
export const unstable_instant: {
  unstable_samples: Array<{ params: { category: string; itemId: string } }>
} = {
  unstable_samples: [
    { params: { category: 'electronics', itemId: 'phone' } },
    { params: { category: 'clothing', itemId: 'shirt' } },
  ],
}
export const prefetch = 'allow-runtime'

type Params = { category: string; itemId: string }

export default async function RuntimePrefetchLayoutSplitPage({
  params,
}: {
  params: Promise<Params>
}) {
  return (
    <div id="runtime-prefetch-layout-split-page">
      <Suspense fallback={<div>Loading page...</div>}>
        <StaticContent params={params} />
      </Suspense>
    </div>
  )
}

async function StaticContent({ params }: { params: Promise<Params> }) {
  // Only access category — page varies on category but NOT itemId
  const { category } = await params
  return (
    <>
      <div data-page-content="true">{`Page category: ${category}`}</div>
      <Suspense fallback={<div data-loading="true">Loading details...</div>}>
        <DynamicContent />
      </Suspense>
    </>
  )
}

async function DynamicContent() {
  await connection()
  return <div data-dynamic-content="true">Dynamic details loaded</div>
}
