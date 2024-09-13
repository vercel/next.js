import { unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'
export const fetchCache = 'default-cache'

// this is ensuring we still update TTL even
// if the cache value didn't change during revalidate
const stableCacheItem = unstable_cache(
  async () => {
    return 'consistent value'
  },
  [],
  {
    revalidate: 3,
    tags: ['thankyounext'],
  }
)

export default async function Page() {
  const data = await fetch('https://example.vercel.sh', {
    next: { tags: ['thankyounext'], revalidate: 3 },
  }).then((res) => res.text())

  const cachedValue = stableCacheItem()

  return (
    <>
      <p>hello world</p>
      <p id="data">{data}</p>
      <p id="cache">{cachedValue}</p>
    </>
  )
}
