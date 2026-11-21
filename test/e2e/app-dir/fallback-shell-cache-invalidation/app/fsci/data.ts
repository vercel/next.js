import { cacheTag } from 'next/cache'

export async function getValueForSlug(slug: string) {
  'use cache'
  cacheTag(`fallback-shell-cache-invalidation:slug:${slug}`)
  return Math.random()
}

export async function getSharedValue() {
  'use cache'
  cacheTag('fallback-shell-cache-invalidation:shared')
  return Math.random()
}
