import { cacheLife, cacheTag } from 'next/cache'
import { data } from './data'

export async function readShortLived(key: string) {
  'use cache'
  cacheTag(`short-lived:${key}`)
  cacheLife({ stale: 30, revalidate: 120, expire: 180 })
  return `short-lived ${key}`
}

export async function waitForWarmup(key: string) {
  'use cache'
  await data(`wait:stored:short-lived:${key}`)
}
