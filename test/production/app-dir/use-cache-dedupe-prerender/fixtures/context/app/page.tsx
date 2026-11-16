import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { readShortLived, waitForWarmup } from '../cache'
import { data } from '../data'

async function ShortLived() {
  await waitForWarmup('shared')
  return <p id="short-lived">{await readShortLived('shared')}</p>
}

async function Outer() {
  'use cache'
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 })
  await data('wait:lookup:short-lived:shared')
  const result = readShortLived('shared')
  // The test releases the direct call's `get()` after this nested call starts.
  await data('join-ready')
  return <p id="outer">{await result}</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="short-pending">Loading short-lived</p>}>
        <ShortLived />
      </Suspense>
      <Outer />
    </main>
  )
}
