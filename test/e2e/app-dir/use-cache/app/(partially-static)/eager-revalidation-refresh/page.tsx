import { cacheTag, cacheLife } from 'next/cache'
import { RefreshClient } from './client'

async function getCachedTimestamp() {
  'use cache'
  cacheTag('eager-refresh-test')
  cacheLife('max')
  return Date.now().toString()
}

export default async function Page() {
  const cachedTimestamp = await getCachedTimestamp()
  return (
    <div>
      <p id="cached-timestamp">{cachedTimestamp}</p>
      <RefreshClient />
    </div>
  )
}
