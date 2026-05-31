'use cache'

import { cacheLife } from 'next/cache'
import type { Span } from './actions'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// A `'use cache'` function called from the client. The label is part of the
// cache key, so a unique label per call (tests pass a nonce) forces a real run
// instead of a cache hit.
export async function slowCache(label: string): Promise<Span> {
  cacheLife('seconds')
  const start = Date.now()
  await sleep(400)
  return { label, start, end: Date.now() }
}
