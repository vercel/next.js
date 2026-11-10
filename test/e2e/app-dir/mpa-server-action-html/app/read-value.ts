import { randomUUID } from 'crypto'
import { cacheLife, cacheTag } from 'next/cache'

export async function readValue(name: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(`mpa-${name}`)
  return `${name}:${randomUUID()}`
}
