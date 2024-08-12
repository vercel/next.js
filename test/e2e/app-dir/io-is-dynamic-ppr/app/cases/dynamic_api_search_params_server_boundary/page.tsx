import { Suspense } from 'react'

// @TODO the current implementation of an RSC render begins rendering pages before higher up
// segments which means if we abort synchronously we will create a dynamic hole for each segment
// before they have had a chance to render anything even if they are entirely static. This can be
// mitigated a bit in the future by reording CacheNodeSeedData type to have the current Segment's
// children appear before the parallel route children but at the end of the day using synchronously
// dynamic APIs is just not a good idea and we need to lean into makign them async and discouraging
// the synchronous form.
export default async function Page({ searchParams }) {
  return (
    <>
      <p>
        This page reads `searchParams.foo` in a client component context. While
        the SSR'd page should not be
      </p>
      <Suspense fallback="loading...">
        <ComponentOne searchParams={searchParams} />
      </Suspense>
      <Suspense fallback="loading too...">
        <ComponentTwo />
      </Suspense>
      <div id="page">{process.env.__TEST_SENTINEL}</div>
    </>
  )
}

function ComponentOne({ searchParams }) {
  let sentinelSearch
  try {
    if (searchParams.sentinel) {
      sentinelSearch = searchParams.sentinel
    } else {
      sentinelSearch = '~not-found~'
    }
  } catch (e) {
    sentinelSearch = '~thrown~'
    // swallow any throw. We should still not be static
  }
  return (
    <div>
      This component accessed `searchParams.sentinel`: "
      <span id="value">{sentinelSearch}</span>"
    </div>
  )
}

function ComponentTwo() {
  return <div>This component didn't access any searchParams properties</div>
}
