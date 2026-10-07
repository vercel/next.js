import { cacheLife, cacheTag } from 'next/cache'
import { readValue } from './state'

export async function getCachedValue() {
  'use cache'
  cacheLife('max')
  cacheTag('same-tag')
  return readValue()
}
