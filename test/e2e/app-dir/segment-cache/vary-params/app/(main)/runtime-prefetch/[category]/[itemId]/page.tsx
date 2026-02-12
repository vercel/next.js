import { Suspense } from 'react'
import { connection } from 'next/server'

/**
 * Runtime prefetch page - canonical test for runtime prefetching.
 *
 * This is the runtime prefetch equivalent of the instant-loading test:
 * - `category` is accessed in the static/cached portion → enables cache sharing
 * - `itemId` is accessed only in the dynamic portion → not relevant for caching
 *
 * This allows cache reuse across different itemId values (same category),
 * providing instant loading feedback when navigating.
 */
export const unstable_instant: {
  prefetch: 'runtime'
  samples: Array<{ params: { category: string; itemId: string } }>
} = {
  prefetch: 'runtime',
  samples: [
    { params: { category: 'electronics', itemId: 'phone' } },
    { params: { category: 'clothing', itemId: 'shirt' } },
  ],
}

type Params = { category: string; itemId: string }

export default async function RuntimePrefetchPage({
  params,
}: {
  params: Promise<Params>
}) {
  return (
    <div id="runtime-prefetch-page">
      {/* Outer Suspense: category is accessed here, included in prefetch */}
      <Suspense fallback={<div>Loading page...</div>}>
        <StaticContent params={params} />
      </Suspense>
    </div>
  )
}

async function StaticContent({ params }: { params: Promise<Params> }) {
  // Access category in the static/cached portion — enables cache sharing
  const { category } = await params

  return (
    <>
      <div data-static-content="true">
        {`Static content - Category: ${category}`}
      </div>

      {/* Inner Suspense: itemId accessed after connection(), NOT in prefetch */}
      <Suspense
        fallback={<div data-loading="true">Loading item details...</div>}
      >
        <DynamicContent params={params} />
      </Suspense>
    </>
  )
}

async function DynamicContent({ params }: { params: Promise<Params> }) {
  // This makes the component dynamic — excluded from the prefetch
  await connection()

  // Access itemId only in the dynamic portion — always fetched at runtime
  const { category, itemId } = await params

  return (
    <div data-dynamic-content="true">
      {`Dynamic content - Item: ${itemId} (in ${category})`}
    </div>
  )
}
