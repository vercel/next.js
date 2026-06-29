'use client'

import { unstable_cache } from 'next/cache'

// Importing next/cache in a Client Component should not pull server internals
// into browser chunks. The bundler sets NEXT_RUNTIME='' for client builds,
// which allows cache.js to DCE the server require() branch.
const getCachedData = unstable_cache(async () => {
  return { data: 'hello' }
})

export function CacheClient() {
  return <button onClick={() => getCachedData()}>Fetch cached</button>
}
