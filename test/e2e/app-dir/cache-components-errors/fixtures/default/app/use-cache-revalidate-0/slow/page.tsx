import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache: remote'

  cacheLife({ revalidate: 0 })

  // This cache takes >1 task to fill, so it'll always show up as a cache miss in dev
  await new Promise((resolve) => setTimeout(resolve, 5))

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
