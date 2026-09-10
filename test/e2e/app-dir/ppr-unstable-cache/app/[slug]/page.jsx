import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default function Page({ params, searchParams }) {
  return (
    <Suspense fallback={<p id="route-fallback">route fallback</p>}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function Content({ params, searchParams }) {
  const { slug } = await params
  const value = await getValue(slug)

  return (
    <article>
      <h1 id="dynamic-ppr-content">{value}</h1>
      <Suspense fallback={<p id="search-fallback">search fallback</p>}>
        <SearchParams searchParams={searchParams} />
      </Suspense>
    </article>
  )
}

async function SearchParams({ searchParams }) {
  const { query = 'none' } = await searchParams
  return <p id="search-params">{query}</p>
}

async function getValue(slug) {
  'use cache'
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 })
  cacheTag('unstable-cache-fetch')

  const forceCached = await fetch(
    process.env.TEST_DATA_SERVER + '?cache=ppr-force-cache',
    { cache: 'force-cache' }
  ).then((response) => response.text())

  return `${slug}:${forceCached}:${process.pid}:${Date.now()}`
}
