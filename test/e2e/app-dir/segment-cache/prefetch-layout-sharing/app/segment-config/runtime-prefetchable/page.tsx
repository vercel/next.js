import { cookies } from 'next/headers'
import { DebugLinkAccordion } from '../../../components/link-accordion'
import { Suspense } from 'react'

// No `export const unstable_prefetch = ...` is needed, we default to static
// (but see page description for more on the actual behavior)

export default function Page() {
  return (
    <main>
      <h1>Child of a runtime prefetchable layout</h1>

      <div>
        <p>
          When this page is prefetched from outside of the{' '}
          <code>/segment-config/runtime-prefetchable</code> segment, the page
          contents will be runtime-prefetched (despite this segment not being
          marked as runtime-prefetchable) because the parent layout is marked as
          runtime-prefetchable.
        </p>
        <Suspense fallback="Loading...">
          <RuntimePrefetchable />
        </Suspense>
      </div>

      <ul>
        <li>
          A page that shares some layouts with this page, and should use a
          static prefetch:
          <br />
          <DebugLinkAccordion href="/segment-config/runtime-prefetchable/configured-as-static" />
        </li>
        <li>
          A page that shares some layouts with this page, and should use a
          runtime prefetch:
          <br />
          <DebugLinkAccordion href="/segment-config/runtime-prefetchable/configured-as-runtime" />
        </li>
        <li>
          A page that shares some layouts with this page, and has a fully static
          page segment
          <br />
          <DebugLinkAccordion href="/segment-config/runtime-prefetchable/fully-static" />
        </li>
      </ul>
    </main>
  )
}

async function RuntimePrefetchable() {
  await cookies()
  return (
    <div id="runtime-prefetchable-content-page">
      Runtime-prefetchable content from page
    </div>
  )
}
