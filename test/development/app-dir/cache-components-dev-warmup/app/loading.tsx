import { fetchCached, getCachedData } from './data-fetching'

export default async function Loading() {
  await fetchCached(
    'https://next-data-api-endpoint.vercel.app/api/random?key=cachedpage'
  )
  await getCachedData('page')
  return <main>loading...</main>
}
