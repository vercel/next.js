import { fetchCached, getCachedData } from './data-fetching'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <section>
          <h1>Layout</h1>
          <p>This data is from the root layout</p>
          <FetchingComponent />
          <CachedFetchingComponent />
          <CachedDataComponent />
        </section>
      </body>
    </html>
  )
}

async function CachedFetchingComponent() {
  const data = await fetchCached(
    'https://next-data-api-endpoint.vercel.app/api/random?key=cachedlayout'
  )
  console.log('after cached layout fetch')
  return (
    <dl>
      <dt>
        Cached Fetch
        (https://next-data-api-endpoint.vercel.app/api/random?key=cachedlayout)
      </dt>
      <dd>{data}</dd>
    </dl>
  )
}

async function FetchingComponent() {
  const response = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?key=uncachedlayout'
  )
  console.log('after uncached layout fetch')
  const data = await response.text()
  return (
    <dl>
      <dt>
        Uncached Fetch
        (https://next-data-api-endpoint.vercel.app/api/random?key=uncachedlayout)
      </dt>
      <dd>{data}</dd>
    </dl>
  )
}

async function CachedDataComponent() {
  const data = await getCachedData('layout')
  console.log('after layout cache read')
  return (
    <dl>
      <dt>Cached Data</dt>
      <dd>{data}</dd>
    </dl>
  )
}
