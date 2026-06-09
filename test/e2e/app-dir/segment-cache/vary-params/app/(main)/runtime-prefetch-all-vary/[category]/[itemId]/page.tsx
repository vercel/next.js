import { Suspense } from 'react'
import { connection } from 'next/server'

/**
 * Runtime prefetch page where ALL params are accessed in the static portion.
 *
 * Both category and itemId are accessed before connection(), so they
 * are both tracked in varyParams. Every unique combination of (category, itemId)
 * requires its own prefetch — no cache sharing.
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

export default async function RuntimePrefetchAllVaryPage({
  params,
}: {
  params: Promise<Params>
}) {
  return (
    <div id="runtime-prefetch-all-vary-page">
      <Suspense fallback={<div>Loading...</div>}>
        <StaticContent params={params} />
      </Suspense>
    </div>
  )
}

async function StaticContent({ params }: { params: Promise<Params> }) {
  // Access both params in the static portion — both tracked in varyParams
  const { category, itemId } = await params
  return (
    <>
      <div data-static-content="true">
        {`Static content - ${category}/${itemId}`}
      </div>
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
