import { headers } from 'next/headers'
import { connection } from 'next/server'

export const instant = false

export default async function ProxyCausalPage() {
  await connection()
  const requestHeaders = await headers()
  const origin = requestHeaders.get('x-proxy-causal-origin')
  if (!origin) {
    throw new Error('Expected the proxy to provide its direct server origin')
  }
  const response = await fetch(new URL('/api/proxy-causal/page', origin), {
    cache: 'no-store',
  })
  const payload = (await response.json()) as {
    causalCookieVisible: boolean
  }

  return (
    <>
      <p>Proxy fetch: {requestHeaders.get('x-proxy-causal-status')}</p>
      <p>Page fetch: {response.status}</p>
      <p>Causal cookie visible: {String(payload.causalCookieVisible)}</p>
    </>
  )
}
