import { cacheLife } from 'next/cache'

export async function getCachedDate() {
  'use cache: remote'
  cacheLife('max')

  return new Date().toISOString()
}
