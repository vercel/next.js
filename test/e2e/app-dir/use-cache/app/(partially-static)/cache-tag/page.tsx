import React from 'react'
import { cacheTag } from 'next/cache'
import { RevalidateButtons } from './buttons'

async function getCachedWithTag({
  tag,
  fetchCache,
}: {
  tag: string
  fetchCache?: 'force' | 'revalidate'
}) {
  'use cache'
  cacheTag(tag, 'c')

  // If `force-cache` or `revalidate` is used for the fetch call, it creates
  // basically an inner cache, and revalidating tag 'c' won't revalidate the
  // fetch cache. If both are not used, the fetch is not cached at all in the
  // fetch cache, and is included in the cached result of `getCachedWithTag`
  // instead, thus also affected by revalidating 'c'.
  const response = await fetch(
    `https://next-data-api-endpoint.vercel.app/api/random?tag=${tag}`,
    {
      cache: fetchCache === 'force' ? 'force-cache' : undefined,
      next: { revalidate: fetchCache === 'revalidate' ? 42 : undefined },
    }
  )

  const fetchedValue = await response.text()

  return [Math.random(), fetchedValue]
}

export default async function Page() {
  const a = await getCachedWithTag({ tag: 'a' })
  const b = await getCachedWithTag({ tag: 'b' })

  const [f1, f2] = await getCachedWithTag({
    tag: 'f',
    fetchCache: 'force',
  })

  const [r1, r2] = await getCachedWithTag({
    tag: 'r',
    fetchCache: 'revalidate',
  })

  return (
    <div>
      <p id="a">[a, c] {a.join(' ')}</p>
      <p id="b">[b, c] {b.join(' ')}</p>
      <p id="f1">[f, c] {f1}</p>
      <p id="f2">[-] {f2}</p>
      <p id="r1">[r, c] {r1}</p>
      <p id="r2">[-] {r2}</p>
      <RevalidateButtons />
    </div>
  )
}
