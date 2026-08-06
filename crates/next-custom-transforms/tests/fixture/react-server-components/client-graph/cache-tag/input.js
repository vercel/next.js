'use cache'

import { cacheTag } from 'next/cache'

export async function test() {
  cacheTag('test')
  return null
}
