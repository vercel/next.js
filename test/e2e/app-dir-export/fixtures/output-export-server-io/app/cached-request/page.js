import { headers } from 'next/headers'

async function getHeadersInCache() {
  'use cache'

  const requestHeaders = await headers()
  return requestHeaders.get('user-agent') ?? 'unknown'
}

export default async function CachedRequestPage() {
  return <h1>{await getHeadersInCache()}</h1>
}
