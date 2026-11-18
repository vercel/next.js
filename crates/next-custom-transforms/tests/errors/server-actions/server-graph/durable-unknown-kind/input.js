'use cache: unknown'

import { unstable_cacheDurable } from 'next/cache'

export async function cached() {
  unstable_cacheDurable()
}

export async function oldSyntax() {
  'use cache: remote, durable'
}
