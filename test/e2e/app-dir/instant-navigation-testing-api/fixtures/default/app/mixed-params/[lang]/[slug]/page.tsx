import { Suspense } from 'react'
import { connection } from 'next/server'

// A route mixing a `generateStaticParams`-covered param (`lang`, resolved in
// the static shell by the parent layout) with an uncovered one (`slug`). Unlike
// `mixed-params-runtime`, this route does NOT opt into runtime prefetching, so
// a normal (no `prefetch` prop) navigation carries only the covered `lang` in
// the shell; the uncovered `slug` and the request-time `connection()` sibling
// stay deferred behind their Suspense fallbacks until the navigation completes.
export default function MixedParamsPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  return (
    <div>
      <h1 data-testid="mixed-params-title">Mixed Params Page</h1>
      <Suspense
        fallback={<div data-testid="mixed-slug-fallback">Loading slug...</div>}
      >
        <SlugContent params={params} />
      </Suspense>
      <Suspense
        fallback={
          <div data-testid="mixed-dynamic-fallback">Loading dynamic...</div>
        }
      >
        <DynamicContent />
      </Suspense>
    </div>
  )
}

async function SlugContent({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { slug } = await params

  return <div data-testid="mixed-slug-value">slug: {slug}</div>
}

async function DynamicContent() {
  await connection()

  return <div data-testid="mixed-dynamic-value">dynamic content</div>
}
