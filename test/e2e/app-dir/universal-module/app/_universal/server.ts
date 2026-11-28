import { cacheLife } from 'next/cache'

export async function getValue() {
  'use cache'
  cacheLife('hours')
  return 'value from the SERVER module'
}
