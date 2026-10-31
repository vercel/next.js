import { cacheLife, cacheTag } from 'next/cache'
import { data } from './data'

export async function readShortLived(key: string) {
  'use cache'
  cacheTag(`short-lived:${key}`)
  // A long-lived entry keeps the expiration test's content in the static shell.
  if (process.env.TEST_HOLD_EXPIRATION === '1') {
    cacheLife('hours')
  } else {
    cacheLife({ stale: 30, revalidate: 120, expire: 180 })
  }
  return `short-lived ${key}`
}

export async function waitForWarmup(key: string) {
  'use cache'
  await data(`wait:stored:short-lived:${key}`)
}
