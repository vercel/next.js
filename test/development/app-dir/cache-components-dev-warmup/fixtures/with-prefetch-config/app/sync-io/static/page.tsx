import { CachedData, getCachedData } from '../../data-fetching'

export const unstable_prefetch = { mode: 'runtime', samples: [{}] }

const CACHE_KEY = __dirname + '/__PAGE__'

export default async function Page() {
  await getCachedData(CACHE_KEY + '-1')
  console.log(`after first cache`)

  Date.now()
  console.log(`after sync io`)

  return (
    <main>
      <h1>Sync IO - static stage</h1>
      <CachedData label="page" cacheKey={CACHE_KEY} />
    </main>
  )
}
