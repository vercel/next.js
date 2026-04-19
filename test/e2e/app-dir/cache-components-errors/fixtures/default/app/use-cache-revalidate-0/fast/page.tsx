import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache: remote'

  cacheLife({ revalidate: 0 })

  // This cache can produce an entry microtaskily.
  // We explicitly test it separately from "slow" caches,
  // because of a dev bug where "fast" caches like this didn't register as a cache miss
  // and thus sidestepped the usual logic for omitting short-lived caches.

  return (
    <>
      <p>
        This page is cached with a zero revalidate time. Such a short-lived
        cache is excluded from prerenders, and creates a dynamic hole. Without a
        parent suspense boundary, this will cause an error during prerendering.
      </p>
    </>
  )
}
