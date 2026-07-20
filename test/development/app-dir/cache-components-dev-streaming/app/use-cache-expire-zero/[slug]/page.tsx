import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'
import { cacheLife } from 'next/cache'

export const prefetch = 'allow-runtime'

// A distinct slug per test keys a separate cache entry (so the first request
// for each slug is a genuine cold miss), while both tests share this one
// runtime-prefetchable page. Declaring the slugs also keeps `params` statically
// known, so the page shell doesn't depend on dynamic params. In development
// this does not pre-fill the cache.
export function generateStaticParams() {
  return [{ slug: 'nav' }, { slug: 'reload' }]
}

async function getExpireZeroValue(slug: string) {
  'use cache'
  // An explicit short `expire` opts this public cache into a dynamic,
  // client-only life: excluded from the static shell, but included in the
  // runtime prefetch. The slug keys the entry; the value itself is just a
  // timestamp.
  cacheLife({ expire: 0 })
  await setTimeout(1500)
  return new Date().toISOString()
}

async function ExpireZeroCached({ slug }: Promise<{ slug: string }>) {
  const value = await getExpireZeroValue(slug)

  return <p id="expire-zero">{value}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p id="expire-zero-fallback">Loading...</p>}>
      <ExpireZeroCached slug={params.then(({ slug }) => slug)} />
    </Suspense>
  )
}
