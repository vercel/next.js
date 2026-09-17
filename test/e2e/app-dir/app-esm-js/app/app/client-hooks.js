'use client'

import { useRouter } from 'next/navigation'
import cache from 'next/cache'

export function ClientHooks() {
  useRouter()
  return <span className="client-cache">{typeof cache.unstable_cache}</span>
}
