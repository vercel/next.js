import { randomUUID } from 'node:crypto'
import { cacheLife, cacheTag } from 'next/cache'

export async function readData(key: string) {
  'use cache: handoff'
  // This entry survives RDC serialization. Its stale time excludes its value
  // and tag from the static shell, so invalidation can leave the shell cached
  // while this RDC entry becomes obsolete.
  cacheLife({ stale: 0, revalidate: 120, expire: 3600 })
  const value = `handler-handoff-${randomUUID()}`
  cacheTag(value)
  return value
}
