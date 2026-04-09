'use cache'

import { cacheLife } from 'next/cache'

export async function test() {
  cacheLife('days')
  return null
}
