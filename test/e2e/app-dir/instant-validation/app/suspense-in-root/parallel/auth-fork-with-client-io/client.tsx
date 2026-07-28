'use client'

import { use } from 'react'
import { useDataCache } from '../../../../client-data-fetching-lib/client'

// Suspends on client IO during every SSR pass (the per-render data cache
// starts empty each time). The layout isolates this in a Suspense
// boundary, so the pending IO is allowed by validation.
export function FetchesClientData() {
  const dataCache = useDataCache()
  const promise = dataCache.getOrLoad('my-key', async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    return 'My client data result'
  })
  const data = use(promise)
  return <div>Got client data: "{data}"</div>
}
