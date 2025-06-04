import { fetchCached, getCachedData } from './data-fetching'

export default async function Page() {
  return (
    <main>
      <h1>Warmup Dev Renders</h1>
      <p>
        In Dev when dynamicIO is enabled requests are preceded by a cache
        warming prerender. Without PPR this prerender only includes up to the
        nearest Loading boundary (loading.tsx) and will never include the Page
        itself. When PPR is enabled it will include everything that is
        prerenderable including the page if appropriate.
      </p>
      <FetchingComponent />
      <CachedFetchingComponent />
      <CachedDataComponent />
    </main>
  )
}

async function CachedFetchingComponent() {
  const data = await fetchCached(
    'https://next-data-api-endpoint.vercel.app/api/random?key=cachedpage'
  )
  console.log('after cached page fetch')
  return (
    <dl>
      <dt>
        Cached Fetch
        (https://next-data-api-endpoint.vercel.app/api/random?key=cachedpage)
      </dt>
      <dd>{data}</dd>
    </dl>
  )
}

async function FetchingComponent() {
  const response = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?key=uncachedpage'
  )
  console.log('after uncached page fetch')
  const data = await response.text()
  return (
    <dl>
      <dt>
        Uncached Fetch
        (https://next-data-api-endpoint.vercel.app/api/random?key=uncachedpage)
      </dt>
      <dd>{data}</dd>
    </dl>
  )
}

async function CachedDataComponent() {
  const data = await getCachedData('page')
  console.log('after page cache read')
  return (
    <dl>
      <dt>Cached Data (Page)</dt>
      <dd>{data}</dd>
    </dl>
  )
}
