import { cacheLife, cacheTag } from 'next/cache'

// Same cache life as the configured "frozen" profile, but passed inline. The
// values are forwarded into the cache entry metadata that is handed to cache
// handlers (see handler.js) and serialized into the resume data cache.
export default async function Page() {
  'use cache'
  cacheLife({ stale: 300, revalidate: Infinity, expire: Infinity })
  cacheTag('inline-frozen')

  return <p id="value">{new Date().toISOString()}</p>
}
