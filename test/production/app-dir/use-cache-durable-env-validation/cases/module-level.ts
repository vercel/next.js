'use cache: remote'

import { unstable_cacheDurable } from 'next/cache'

export async function getValue() {
  unstable_cacheDurable()
  return process.env.UNSTABLE_DURABLE_TEST
}
