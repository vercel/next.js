import { Suspense } from 'react'
import { unstable_navigation as navigation } from 'next/cache'

type Params = { slug: string }

// A fully static dynamic route: every param value is known via
// `generateStaticParams` and the page accesses no runtime data, so each URL
// is prerendered at build time and the route tree prefetch always carries
// the static-prefetch hint — the Shell phase attempts static per-segment
// prefetches for any URL of this route.
//
// The param-dependent content sits past the shell boundary of each
// prerender, so the App Shell — everything above it — is identical for every
// param value and is cached at a param-agnostic key. Prefetching ONE URL of
// the route therefore populates shell entries that are cache hits for every
// sibling URL: that cross-param reuse is what the consuming test pins.
export async function generateStaticParams() {
  return [{ slug: 'one' }, { slug: 'two' }]
}

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <p id="page-content">Dynamic-param page shell text</p>
      <Suspense fallback={<p id="slug-loading">Loading param content...</p>}>
        <SlugContent params={params} />
      </Suspense>
      <Suspense
        fallback={<p id="navigation-loading">Loading navigation content...</p>}
      >
        <NavigationContent />
      </Suspense>
    </main>
  )
}

async function SlugContent({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  return <p id="slug-content">{`Dynamic param content: ${slug}`}</p>
}

async function NavigationContent() {
  await navigation()
  return <p id="navigation-content">Navigation content</p>
}
