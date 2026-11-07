import { cacheLife } from 'next/cache'

export async function getCachedValue(key: string) {
  'use cache'
  cacheLife({ stale: 300, revalidate: 1, expire: 3600 })
  const response = await fetch(
    `${process.env.TEST_DATA_SERVICE_URL}?key=${encodeURIComponent(key)}`,
    { cache: 'no-store' }
  )
  return response.text()
}

export async function waitForForegroundCacheFill(key: string) {
  'use cache'
  cacheLife('hours')
  const response = await fetch(
    `${process.env.TEST_DATA_SERVICE_URL}?key=${encodeURIComponent(key)}`,
    { cache: 'no-store' }
  )
  await response.text()
}
