import { headers } from 'next/headers'

export const runtime = 'edge'

export default async function EdgeProxyPage() {
  const requestHeaders = await headers()
  return (
    <p id="proxy-fetch-status">{requestHeaders.get('x-proxy-fetch-status')}</p>
  )
}
