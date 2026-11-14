'use cache: remote'

import { unstable_cacheDurable } from 'next/cache'

export async function moduleDurable() {
  unstable_cacheDurable()
  return process.env.STABLE_DURABLE_TEST
}
