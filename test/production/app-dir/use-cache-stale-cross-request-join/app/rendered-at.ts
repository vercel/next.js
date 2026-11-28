import { cacheLife, cacheTag } from 'next/cache'

export async function renderedAtTimestampForSlug(slug: string) {
  'use cache'
  cacheTag('all-slugs')
  cacheLife('days')
  return `${slug} rendered at ${new Date().toISOString()}`
}
