import { cacheLife, cacheTag } from 'next/cache'

export async function getValue() {
  'use cache'
  cacheLife('max')
  cacheTag('window')
  return Math.random().toString()
}
