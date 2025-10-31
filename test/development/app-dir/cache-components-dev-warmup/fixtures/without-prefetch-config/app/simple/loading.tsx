import { fetchCachedRandom, getCachedData } from '../data-fetching'

// Deliberately using the same cache keys as the page.
const CACHE_KEY = __dirname + '/__PAGE__'

export default async function Loading() {
  await fetchCachedRandom(CACHE_KEY) // Mirrors `CachedFetchingComponent`
  await getCachedData(CACHE_KEY) // Mirrors `CachedDataComponent`
  return <main>loading...</main>
}
