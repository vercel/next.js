// Cache body sleeps 17s, which exceeds the configured dev `useCacheTimeout`
// (15s) — proving the configured value is actually applied in dev (and
// not the hard-coded default or some other value).
async function getCachedData(): Promise<string> {
  'use cache'

  await new Promise((resolve) => setTimeout(resolve, 17_000))

  return 'cached'
}

async function Cached() {
  const data = await getCachedData()

  return <p id="result">{data}</p>
}

export default function Page() {
  return <Cached />
}
