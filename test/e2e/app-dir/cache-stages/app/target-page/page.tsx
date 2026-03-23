import { Suspense } from 'react'
import { CachedWithNavigation } from './cached-with-navigation'
import { SearchParamDisplay } from './search-param-display'
import { LinkAccordion } from '../../components/link-accordion'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ searchParams: { q: 'test' } }],
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  return (
    <div>
      <p id="included-in-prefetch">Included in prefetch</p>
      <Suspense fallback={<p>loading search...</p>}>
        <SearchParamDisplay searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p id="nav-fallback">loading nav...</p>}>
        <CachedWithNavigation />
      </Suspense>
      <LinkAccordion href="/other">Go to other page</LinkAccordion>
    </div>
  )
}
