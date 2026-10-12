import { unstable_cache } from 'next/cache'

export const revalidate = 10

const getCachedData = unstable_cache(
  async () => {
    const generatedAt = Date.now()

    console.log(
      '[NESTED TEST] unstable_cache callback executed at:',
      generatedAt
    )

    await new Promise((resolve) => setTimeout(resolve, 100))

    return { generatedAt }
  },
  ['nested-inner-cached-data'],
  { revalidate: 5 }
)

const getNestedCachedData = unstable_cache(
  async () => getCachedData(),
  ['nested-outer-cached-data'],
  { revalidate: 5 }
)

export default async function Page() {
  const cachedData = await getNestedCachedData()

  console.log(
    '[NESTED TEST] Page render completed with cache data from:',
    cachedData.generatedAt
  )

  return <div id="cache-generated-at">{cachedData.generatedAt}</div>
}
