import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

export default function Page() {
  return (
    <main>
      <p>
        Caches that use the 'seconds' profile will be omitted from static
        prerenders, making this essentially dynamic. If we omit it, it should
        not affect the cache life of the prerender.
      </p>
      <Suspense fallback="Loading...">
        <ShortLivedContent />
      </Suspense>
      <br />
      <p>Longer lived caches should still affect the cache life of the page.</p>
      <LongerLivedContent />
    </main>
  )
}

async function ShortLivedContent() {
  'use cache'
  cacheLife('seconds')
  return <div>Short-lived cached content</div>
}

async function LongerLivedContent() {
  'use cache'
  cacheLife('minutes')
  return <div>Longer-lived cached content</div>
}
