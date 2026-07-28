import { Suspense } from 'react'

// A page that observes its searchParams: like cookies, search params hang
// during a static prerender but resolve during a runtime one, so observing
// them is recorded as a runtime-data access in the shell stage of every
// prerender. The route tree prefetch never carries the static-prefetch hint
// and the client should go straight to a runtime shell prefetch without
// attempting a static one.

async function SearchContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  return <div id="search-content">{`Query: ${q ?? 'none'}`}</div>
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  return (
    <main>
      <p id="page-content">Search params page shell text</p>
      <Suspense fallback={<p id="search-loading">Loading query...</p>}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
