import { unstable_cache } from 'next/cache'

export const revalidate = 10

const getCachedData = unstable_cache(
  async () => {
    const generatedAt = Date.now()

    // Log when this function is actually executed
    console.log('[TEST] unstable_cache callback executed at:', generatedAt)

    // Add a delay to simulate expensive operation
    await new Promise((resolve) => setTimeout(resolve, 100))

    return {
      generatedAt,
      random: Math.random(),
    }
  },
  ['cached-data'],
  {
    revalidate: 5,
  }
)

export default async function Page() {
  const pageRenderStart = Date.now()
  console.log('[TEST] Page render started at:', pageRenderStart)

  const cachedData = await getCachedData()

  console.log(
    '[TEST] Page render completed with cache data from:',
    cachedData.generatedAt
  )

  return (
    <div>
      <div id="page-time">{pageRenderStart}</div>
      <div id="cache-generated-at">{cachedData.generatedAt}</div>
      <div id="random">{cachedData.random}</div>
    </div>
  )
}
