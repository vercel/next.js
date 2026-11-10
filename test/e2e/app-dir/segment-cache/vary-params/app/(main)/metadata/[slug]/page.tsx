import { Suspense } from 'react'
import { connection } from 'next/server'

type Params = { slug: string }

/**
 * Page where generateMetadata accesses params but the body does NOT.
 *
 * This tests that metadata param access is tracked separately from page body.
 * When the slug changes:
 * - Head segment should be re-fetched (metadata accesses slug)
 * - Body segment should be cached (body does NOT access slug)
 *
 * The body contains a self-contained dynamic marker (`<DynamicContent />`
 * inside Suspense). This is the documented mitigation for dynamic
 * `generateMetadata` on an otherwise-static body — it makes the body partially
 * dynamic via PPR, which is what we actually want here: the body doesn't depend
 * on `slug`, so the static portion of the prefetch is still cacheable across
 * slug changes.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return [{ slug: 'aaa' }, { slug: 'bbb' }, { slug: 'ccc' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  return { title: `Page: ${slug}` }
}

export default function MetadataPage() {
  // Intentionally NOT accessing params here - body should be cached
  return (
    <div id="metadata-page">
      <div data-content="true">{`Static page body`}</div>
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
