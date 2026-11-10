// Cache body sleeps 11s, which falls between the build-time clamp (9s)
// and the configured dev `useCacheTimeout` (15s).
// - Dev: the cache fills successfully (15s > 11s, no clamp).
// - Build: the cache times out (clamp 9s < 11s).
async function getCachedData(): Promise<string> {
  'use cache'

  await new Promise((resolve) => setTimeout(resolve, 11_000))

  return 'cached'
}

async function Cached() {
  const data = await getCachedData()

  return <p id="result">{data}</p>
}

export default function Page() {
  return <Cached />
}
