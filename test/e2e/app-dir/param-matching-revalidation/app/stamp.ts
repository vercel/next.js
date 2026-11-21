import { cacheLife, cacheTag } from 'next/cache'

export async function getStamp(kind: string, key: string) {
  'use cache'
  cacheTag(`pm-reval:${kind}:${key}`, `pm-reval:${kind}`)
  return `${Date.now()}-${Math.random()}`
}

export async function getTimedStamp(key: string) {
  'use cache'
  cacheLife({ stale: 30, revalidate: 1, expire: 300 })
  cacheTag(`pm-reval:timed:${key}`, 'pm-reval:timed')
  return `${Date.now()}-${Math.random()}`
}
