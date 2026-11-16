import { randomUUID } from 'node:crypto'
import { cacheLife, cacheTag } from 'next/cache'

export async function readData(key: string) {
  'use cache: handoff'
  // This entry survives RDC serialization at the minimum stale time of 30
  // seconds. Its stale time stays below 300 seconds so the app shell omits its
  // value and tag.
  cacheLife({ stale: 30, revalidate: 120, expire: 3600 })
  const value = `handler-handoff-${randomUUID()}`
  cacheTag(value)
  return value
}
