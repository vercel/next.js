import { randomUUID } from 'node:crypto'
import { cacheLife, cacheTag } from 'next/cache'

export async function getValue(key: string) {
  'use cache: remote'
  cacheLife({ stale: 0, revalidate: 3600, expire: 86400 })
  cacheTag('streamed:' + key)
  return randomUUID()
}
