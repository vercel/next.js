import { cacheLife } from 'next/cache'

export default async function Page() {
  return (
    <main>
      <CachedContent />
    </main>
  )
}

async function CachedContent() {
  'use cache'
  cacheLife({ stale: 120 })
  return <p id="cached-content">Cached content ({new Date().toISOString()})</p>
}
