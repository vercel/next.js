'use cache: remote'

import { unstable_cacheDurable } from 'next/cache'

export async function getModuleValue() {
  unstable_cacheDurable()
  return 'module durable value'
}
