import { Suspense } from 'react'
import { connection } from 'next/server'

/**
 * Runtime prefetch page where generateMetadata accesses params but the
 * page body does NOT.
 *
 * This tests that head vary params are tracked separately from segment body
 * in the runtime prefetch pipeline. When slug changes:
 * - Head segment should be re-fetched (metadata accesses slug)
 * - Body segment should be cached (body does NOT access slug)
 */
export const unstable_instant: {
  unstable_samples: Array<{ params: { slug: string } }>
} = {
  unstable_samples: [{ params: { slug: 'aaa' } }, { params: { slug: 'bbb' } }],
}
export const prefetch = 'allow-runtime'

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  return { title: `Runtime Metadata: ${slug}` }
}

export default async function RuntimePrefetchMetadataPage() {
  // Intentionally NOT accessing params in the body
  return (
    <div id="runtime-prefetch-metadata-page">
      <Suspense fallback={<div>Loading...</div>}>
        <DynamicContent />
      </Suspense>
      <div data-content="true">Static page body - no param access</div>
    </div>
  )
}

async function DynamicContent() {
  await connection()
  return <div data-dynamic-content="true">Dynamic content loaded</div>
}
