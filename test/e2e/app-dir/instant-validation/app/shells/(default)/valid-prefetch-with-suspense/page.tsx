import { Instant } from 'next'
import { unstable_prefetch } from 'next/cache'
import { Suspense } from 'react'

export const instant: Instant = {
  level: 'experimental-error',
}

export const prefetch = 'partial'

export default async function Page() {
  return (
    <main>
      <p>
        This page has a suspense around prefetch(), so we can render a shell and
        should have no validation errors.
      </p>
      <Suspense>
        <PrefetchContent />
      </Suspense>
    </main>
  )
}

async function PrefetchContent() {
  await unstable_prefetch()
  return <div>{`Prefetch content`}</div>
}
