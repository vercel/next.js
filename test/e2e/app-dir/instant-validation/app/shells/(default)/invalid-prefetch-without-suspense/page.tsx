import { Instant } from 'next'
import { unstable_prefetch } from 'next/cache'

export const instant: Instant = {
  level: 'experimental-error',
}

export const prefetch = 'partial'

export default async function Page() {
  return (
    <main>
      <p>
        This page is missing a suspense around prefetch(), so we can't render a
        shell.
      </p>
      <PrefetchContent />
    </main>
  )
}

async function PrefetchContent() {
  await unstable_prefetch()
  return <div>{`Prefetch content`}</div>
}
