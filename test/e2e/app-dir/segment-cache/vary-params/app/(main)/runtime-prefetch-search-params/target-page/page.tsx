import { Suspense } from 'react'
import { connection } from 'next/server'

/**
 * Runtime prefetch page that does NOT access searchParams.
 *
 * Since searchParams are not accessed, the '?' sentinel is not added to
 * varyParams, and different search param values share the cached segment.
 */
export const unstable_instant = {
  unstable_samples: [{ searchParams: { q: '1' } }],
}
export const prefetch = 'allow-runtime'

export default async function RuntimePrefetchSearchParamsTargetPage() {
  // Intentionally NOT accessing searchParams
  return (
    <div id="runtime-prefetch-search-params-target">
      <div data-content="true">Static content - searchParams not accessed</div>
      <Suspense fallback={<div>Loading...</div>}>
        <DynamicContent />
      </Suspense>
    </div>
  )
}

async function DynamicContent() {
  await connection()
  return <div data-dynamic-content="true">Dynamic content loaded</div>
}
