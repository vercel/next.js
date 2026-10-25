import { cacheLife } from 'next/cache'
import { randomUUID } from 'node:crypto'

export async function getGeneratorValue(kind: string) {
  'use cache: remote'
  cacheLife('days')

  return randomUUID()
}
