import { Instant } from 'next'
import { unstable_prefetch } from 'next/cache'

export const instant: Instant = {
  level: 'experimental-error',
}

export default async function Page() {
  return (
    <main>
      <p>
        This page is missing a suspense around prefetch(), but that's allowed if
        we're not in partialPrefetching and aren't rendering App Shells.
      </p>
      <PrefetchContent />
    </main>
  )
}

async function PrefetchContent() {
  await unstable_prefetch()
  return <div>{`Prefetch content`}</div>
}
