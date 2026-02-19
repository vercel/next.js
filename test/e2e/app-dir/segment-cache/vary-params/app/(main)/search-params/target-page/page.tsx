import { Suspense } from 'react'

/**
 * Page that accesses searchParams with runtime prefetching.
 *
 * By awaiting searchParams, this page's cache key varies by search params.
 * Different search param values will NOT share cached prefetch data.
 *
 * The searchParams access must be inside a Suspense boundary for runtime
 * prefetching to work - the page shell is static, the searchParams-dependent
 * content is runtime-prefetchable.
 *
 * Expected behavior:
 * - Prefetching /target?foo=1 fetches the segment with foo=1 content
 * - Prefetching /target?foo=2 fetches the segment AGAIN (no cache hit)
 */
export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ searchParams: { foo: '1' } }],
}

type SearchParams = { foo?: string }

export default async function SearchParamsTargetPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <div id="search-params-target-page">
      <Suspense fallback={<div>Loading search params...</div>}>
        <SearchParamsContent searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function SearchParamsContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  // Access searchParams inside Suspense - this affects the cache key
  const { foo } = await searchParams
  return (
    <div data-search-params-content="true">
      {`Search params target - foo: ${foo ?? 'undefined'}`}
    </div>
  )
}
