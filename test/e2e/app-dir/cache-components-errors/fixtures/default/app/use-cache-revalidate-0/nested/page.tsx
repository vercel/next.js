import { cacheLife } from 'next/cache'

async function ShortLivedCached() {
  'use cache: remote'

  cacheLife({ revalidate: 0 })

  return (
    <p>
      This component is cached with a zero revalidate time. Such a short-lived
      cache would normally create a dynamic hole and be excluded from
      prerenders. However, when nested inside another 'use cache' that doesn't
      specify an explicit `cacheLife`, this will error during prerendering,
      instead of silently creating a dynamic hole. This is to prevent accidental
      misconfigurations, where a developer may forget to set an explicit
      `cacheLife` on a parent 'use cache' boundary, not knowing that a nested
      'use cache' is using a short-lived cache, which would degrade the parent
      'use cache' to a dynamic hole. If there is a parent suspense boundary,
      this might not be noticeable, so we error during prerendering to make sure
      the developer is aware of the situation and picks an explicit `cacheLife`
      for the parent 'use cache'.
    </p>
  )
}

// TODO: Add try/catch to test userland error handling won't suppress the build error.
export default async function Page() {
  'use cache'

  // Explicitly not setting a `cacheLife` here means this will use the implicit
  // default cache life, i.e. the shortest cache life of any nested 'use cache'
  // will be applied, or the values of the 'default' profile if none are nested.

  return <ShortLivedCached />
}
