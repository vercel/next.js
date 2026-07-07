import Link from 'next/link'
import { Suspense, cacheSignal } from 'react'
import { setTimeout } from 'timers/promises'
import { cookies } from 'next/headers'

export const prefetch = 'allow-runtime'

const callCounts = new Map<string, number>()

function getNonDeterministicItems(slug: string) {
  // For testing purposes, this creates an artificial deterministic scenario
  // that in real-world apps would usually be triggered by a race condition
  // only sometimes (e.g. concurrent async operations pushing results into a
  // shared array in non-deterministic order, and that array then being passed
  // as an argument to a cached function).
  //
  // Call 1 (prospective prerender) warms the RDC entry for ['b','a'].
  // Call 2+ (final prerender) uses ['a','b'], which produces a different cache
  // key that misses the RDC.
  const count = (callCounts.get(slug) ?? 0) + 1
  callCounts.set(slug, count)
  return count === 1 ? ['b', 'a'] : ['a', 'b']
}

async function getCachedValue(items: string[]) {
  'use cache'
  await setTimeout(1000)
  return items.join(',')
}

async function Content({ slug }: { slug: string }) {
  if (slug === 'known') {
    // Awaiting cookies() causes this to suspend during build-time prerendering
    // (cookies are not available at build time). During runtime prefetch,
    // cookies are available so rendering continues past this point and hits the
    // non-deterministic cached function.
    await cookies()
  }

  const items = getNonDeterministicItems(slug)

  try {
    const value = await getCachedValue(items)
    return (
      <p id="cached">
        {slug} {value}
      </p>
    )
  } catch (error) {
    // We only log and re-throw errors that occur while the render is still
    // active. After the prerender is aborted, the hanging promise rejects with
    // an expected error that we can safely ignore. This is the intended use of
    // `React.cacheSignal()`. Userspace code should use it the same way to
    // distinguish real errors from expected prerender teardown.
    if (!cacheSignal()?.aborted) {
      console.error('getCachedValue error:', error)
      throw error
    }
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (slug === 'with-runtime-prefetch') {
    return <Link href="/known">Go to runtime-prefetchable page</Link>
  }

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content slug={slug} />
    </Suspense>
  )
}

export function generateStaticParams() {
  return [{ slug: 'known' }, { slug: 'with-runtime-prefetch' }]
}
