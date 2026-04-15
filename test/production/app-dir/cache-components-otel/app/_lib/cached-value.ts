import { cacheLife, cacheTag } from 'next/cache'

export const CACHE_TAG = 'cache-components-otel'

export async function getCachedValue() {
  'use cache'

  cacheTag(CACHE_TAG)
  cacheLife('max')

  return new Date().toISOString()
}
