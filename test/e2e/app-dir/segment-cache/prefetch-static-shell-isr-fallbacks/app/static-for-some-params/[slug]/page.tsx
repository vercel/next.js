import { unstable_navigation } from 'next/cache'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export async function generateStaticParams() {
  return [{ slug: 'no-cookies' }, { slug: 'yes-cookies' }]
}

function shouldUseRuntimeDataForSlug(slug: string) {
  return !slug.includes('no-cookies')
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <p>This page only accesses runtime data for some param values.</p>
      <Suspense fallback={<div>Loading param content...</div>}>
        <ParamsDependent params={params} />
      </Suspense>
    </main>
  )
}

async function ParamsDependent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  console.log(`rendering page for slug ${slug}`)
  if (slug.includes('not-prerendered')) {
    // TODO(isr-fallbacks): it seems like in `next start` the initial /_tree request
    // already kicks off an ISR prerender. We're trying to test the client router's
    // handling of ISR fallbacks, so we need to make sure that the prerender does not finish
    // before the page itself is requested (because then we'd serve a concrete
    // prerender instead of a fallback)
    await cachedDelay(500, slug)
  }
  return (
    <div>
      <div id="param-value">{`Slug: ${slug}`}</div>
      <ConditionalCookiesUse slug={slug} />
      <NavigationContent slug={slug} />
    </div>
  )
}

async function cachedDelay(durationMs: number, key: string) {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, durationMs))
  return key
}

async function ConditionalCookiesUse({ slug }: { slug: string }) {
  const shouldUseRuntimeData = shouldUseRuntimeDataForSlug(slug)
  if (shouldUseRuntimeData) {
    await cookies()
  }
  return (
    <div>{`Runtime data accessed on ${slug}: ${shouldUseRuntimeData}'`}</div>
  )
}

async function NavigationContent({ slug }: { slug: string }) {
  await unstable_navigation()
  return <div>{`Navigation content on ${slug}`}</div>
}
