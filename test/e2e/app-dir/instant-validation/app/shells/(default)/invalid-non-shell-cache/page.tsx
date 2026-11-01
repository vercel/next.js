import { Instant } from 'next'
import { cacheLife } from 'next/cache'

export const instant: Instant = {
  level: 'experimental-error',
}

export const prefetch = 'partial'

export default function Page() {
  return (
    <main>
      <p>
        This page uses uses a cache that is excluded from the shell due to a
        short staletime, so we can't render a shell.
      </p>
      <PrefetchContent />
    </main>
  )
}

async function PrefetchContent() {
  await nonShellCache()
  return <div>{`Prefetch content`}</div>
}

async function nonShellCache() {
  'use cache'
  cacheLife({ stale: 300 - 1 }) // smaller than MIN_SHELL_STALE
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
