import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache: remote'

  cacheLife({ expire: 299 }) // 1 second below the threshold of 5 minutes

  return (
    <>
      <p>
        This page is cached with a low expire time. Such a short-lived cache is
        excluded from prerenders, and creates a dynamic hole. Without a parent
        suspense boundary, this will cause an error during prerendering.
      </p>
    </>
  )
}
