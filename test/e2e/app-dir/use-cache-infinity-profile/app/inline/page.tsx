import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

// The value is keyed on a search param so that it's not part of the
// prerender, and is instead stored and read back through the JSON-backed
// cache handler at request time.
async function frozenValue(key: string) {
  'use cache'
  cacheLife({ stale: 300, revalidate: Infinity, expire: Infinity })

  return `${key} ${crypto.randomUUID()}`
}

async function Value({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const { key = 'default' } = await searchParams
  return <p id="value">{await frozenValue(key)}</p>
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Value searchParams={searchParams} />
    </Suspense>
  )
}
