import { cacheLife } from 'next/cache'
export async function shortExpire() {
  'use cache'
  cacheLife({ stale: 300, revalidate: 60, expire: 299 })
  return 'Short expire'
}
export async function zeroRevalidate() {
  'use cache'
  cacheLife({ stale: 300, revalidate: 0, expire: 600 })
  return 'Zero revalidate'
}
export async function shortStale() {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 600 })
  return 'Short stale'
}
export async function unprefetchable() {
  'use cache'
  cacheLife({ stale: 29, revalidate: 60, expire: 600 })
  return 'Unprefetchable'
}
export async function valid() {
  'use cache'
  cacheLife({ stale: 30, revalidate: 60, expire: 300 })
  return 'Valid'
}
