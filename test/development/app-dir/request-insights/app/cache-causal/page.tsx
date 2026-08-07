export const instant = false

async function fetchCachedChild(origin: string, key: string) {
  'use cache'

  const response = await fetch(
    `${origin}/api/cache-causal/${encodeURIComponent(key)}`,
    { cache: 'no-store' }
  )
  const payload = (await response.json()) as {
    causalCookieVisible: boolean
  }

  return {
    causalCookieVisible: payload.causalCookieVisible,
    status: response.status,
  }
}

export default async function CacheCausalPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; origin?: string }>
}) {
  const { key = 'default', origin } = await searchParams
  if (!origin) {
    throw new Error('Expected the direct development server origin')
  }
  const result = await fetchCachedChild(origin, key)

  return (
    <>
      <p>Cache child: {result.status}</p>
      <p>Causal cookie visible: {String(result.causalCookieVisible)}</p>
    </>
  )
}
