import { Suspense } from 'react'
import { connection } from 'next/server'

/**
 * Runtime prefetch page where NO params are accessed in the static portion.
 *
 * Both category and itemId are accessed only after connection(), so they
 * are NOT tracked in varyParams. This means ALL param combinations should
 * share the same cached loading shell (empty vary params set = max sharing).
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
export const unstable_prefetch = 'runtime'

type Params = { category: string; itemId: string }

export default async function RuntimePrefetchNoVaryPage({
  params,
}: {
  params: Promise<Params>
}) {
  return (
    <div id="runtime-prefetch-no-vary-page">
      <Suspense
        fallback={
          <div data-loading="true">Loading all content dynamically...</div>
        }
      >
        <DynamicContent params={params} />
      </Suspense>
    </div>
  )
}

async function DynamicContent({ params }: { params: Promise<Params> }) {
  await connection()
  const { category, itemId } = await params
  return (
    <div data-dynamic-content="true">{`Dynamic: ${category}/${itemId}`}</div>
  )
}
