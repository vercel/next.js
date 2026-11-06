'use cache: remote'

import { unstable_cacheDurable } from 'next/cache'

export async function cached() {
  unstable_cacheDurable()
}
