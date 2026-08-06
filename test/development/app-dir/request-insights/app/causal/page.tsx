import { headers } from 'next/headers'

export const instant = false

function getOrigin(requestHeaders: Headers): string {
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http'
  return `${protocol}://${requestHeaders.get('host')}`
}

export default async function CausalPage({
  searchParams,
}: {
  searchParams: Promise<{
    dedupe?: string
    external?: string
    redirect?: string
    spoof?: string
  }>
}) {
  const requestHeaders = await headers()
  const origin = getOrigin(requestHeaders)
  const query = await searchParams
  const target = query.external
    ? query.external
    : query.redirect
      ? `${origin}/api/causal/redirect?to=${encodeURIComponent(query.redirect)}`
      : query.spoof
        ? `${origin}/api/causal/two?spoof=1`
        : `${origin}/api/causal/one${query.dedupe ? `?dedupe=${encodeURIComponent(query.dedupe)}` : ''}`
  const responses = await Promise.all(
    Array.from({ length: query.dedupe ? 2 : 1 }, () =>
      fetch(target, {
        cache: 'no-store',
        headers: query.spoof
          ? {
              'x-forwarded-host': 'attacker.localhost:4444',
              'x-forwarded-proto': 'https',
            }
          : undefined,
      })
    )
  )
  const bodies = await Promise.all(responses.map((response) => response.text()))
  const requestCounts = query.dedupe
    ? bodies.map((body) => JSON.parse(body).requestCount as number).join(',')
    : undefined
  const causalCookieVisible =
    query.dedupe || query.spoof
      ? bodies.some(
          (body) =>
            (JSON.parse(body) as { causalCookieVisible: boolean })
              .causalCookieVisible
        )
      : undefined

  return (
    <p
      id="causal-result"
      data-request-counts={requestCounts}
      data-causal-cookie-visible={
        causalCookieVisible === undefined
          ? undefined
          : String(causalCookieVisible)
      }
    >
      {JSON.stringify(bodies)}
    </p>
  )
}
