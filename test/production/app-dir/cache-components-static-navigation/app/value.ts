import { randomUUID } from 'node:crypto'
import { cacheLife, cacheTag } from 'next/cache'

export async function getValue(kind: string, slug: string) {
  'use cache'
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 })
  cacheTag('cache-components-static-navigation:' + kind + ':' + slug)
  return kind + ':' + slug + ':' + randomUUID()
}
