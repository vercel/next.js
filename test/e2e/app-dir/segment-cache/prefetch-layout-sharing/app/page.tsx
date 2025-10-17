import { DebugLinkAccordion } from '../components/link-accordion'
import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache'
  cacheLife('minutes')
  return (
    <main>
      <h2>shared layout prefetching - layout with cookies and dynamic data</h2>
      <ul>
        <li>
          <DebugLinkAccordion href="/shared-layout/one" prefetch={true} />
        </li>
        <li>
          <DebugLinkAccordion
            href="/shared-layout/one"
            prefetch={'unstable_forceStale'}
          />
        </li>
      </ul>
      <ul>
        <li>
          <DebugLinkAccordion href="/shared-layout/two" prefetch={'auto'} />
        </li>
        <li>
          <DebugLinkAccordion href="/shared-layout/two" prefetch={true} />
        </li>
        <li>
          <DebugLinkAccordion
            href="/shared-layout/two"
            prefetch={'unstable_forceStale'}
          />
        </li>
      </ul>
      <h2>shared layout prefetching - layout with cookies</h2>
      <ul>
        <li>
          <DebugLinkAccordion
            href="/runtime-prefetchable-layout/one"
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href="/runtime-prefetchable-layout/two"
            prefetch={'auto'}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href="/runtime-prefetchable-layout/two"
            prefetch={'unstable_forceStale'}
          />
        </li>
      </ul>

      <h2>shared layout prefetching - segment config</h2>
      <ul>
        <li>
          This link deliberately doesn't specify a `prefetch` prop, because the
          page has a segment-level prefetch config:
          <br />
          <DebugLinkAccordion href="/segment-config/runtime-prefetchable" />
        </li>
      </ul>
    </main>
  )
}
