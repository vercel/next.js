import { Suspense } from 'react'
import { connection } from 'next/server'

// A route that mixes a `generateStaticParams`-covered param (`lang`, resolved
// in the static shell by the parent layout) with an uncovered one (`slug`).
// The route opts into runtime prefetching, so `slug` is resolved by the runtime
// prefetch rather than the static shell. Under instant() we expect both to
// surface — `lang` from the static shell, `slug` from the runtime prefetch —
// while the genuinely request-time `connection()` sibling stays deferred until
// the lock releases.
export const instant: {
  unstable_samples: Array<{ params: { lang: string; slug: string } }>
} = {
  unstable_samples: [{ params: { lang: 'en', slug: 'anything' } }],
}
export const prefetch = 'allow-runtime'

export default function MixedParamsRuntimePage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  return (
    <div>
      <h1 data-testid="mixed-params-runtime-title">
        Mixed Params Runtime Page
      </h1>
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
