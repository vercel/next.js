import { cacheLife } from 'next/cache'
import { Suspense } from 'react'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <Inner />
      </Suspense>
    </main>
  )
}

async function Inner() {
  await nonShellCache()
  return <p>Non-shell data</p>
}

async function nonShellCache() {
  'use cache'
  cacheLife({ stale: 300 - 1 }) // smaller than MIN_SHELL_STALE
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
