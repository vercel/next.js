import { navigation } from 'next/cache'
import { Suspense } from 'react'
import UncachedTimePage from '../uncached-time/page'

// Partial Prefetching embeds a runtime prefetch in navigations to this route.
export const prefetch = 'partial'

async function Content() {
  // The navigation stage defers this subtree past the initial Flight rows. The
  // private cache in UncachedTimePage still resolves before the dynamic stage.
  await navigation()
  return <UncachedTimePage />
}

export default function Page() {
  return (
    <>
      <p>Content before sync IO</p>
      <Suspense fallback={<p>Loading target...</p>}>
        <Content />
      </Suspense>
    </>
  )
}
