async function getHandler() {
  'use cache'
  return (globalThis as any).__testCacheHandler
}

async function getFallbackHandler() {
  'use cache: remote'
  return (globalThis as any).__testCacheHandler
}

export default async function Page() {
  const handler = await getHandler()
  const fallbackHandler = await getFallbackHandler()
  return (
    <>
      <p id="handler">{handler}</p>
      <p id="fallback">{fallbackHandler}</p>
    </>
  )
}
