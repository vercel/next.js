'use client'

import { useRouter } from 'next/navigation.js'
import cache from 'next/cache.js'

export function ClientHooks() {
  useRouter()
  return <span className="client-cache-ext">{typeof cache.unstable_cache}</span>
}
