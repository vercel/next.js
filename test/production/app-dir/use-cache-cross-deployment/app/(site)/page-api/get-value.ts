import { cacheLife } from 'next/cache'
import { getValue } from './server-api'

export async function getPageApiValue(kind: string) {
  'use cache: remote'
  cacheLife('days')

  return getValue()
}
