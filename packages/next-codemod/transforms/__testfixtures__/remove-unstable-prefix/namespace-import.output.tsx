// @ts-nocheck
/* eslint-disable */
import * as cache from 'next/cache'

export function testNamespaceAccess() {
  // Namespace property access
  const tag = cache.cacheTag('tag')
  const life = cache.cacheLife('1 hour')

  // This should remain unchanged
  const path = cache.revalidatePath('/app')

  return { tag, life, path }
}