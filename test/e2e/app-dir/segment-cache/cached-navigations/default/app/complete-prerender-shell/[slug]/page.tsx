import { Suspense } from 'react'

// Both slugs are prerendered, so each is served as a complete prerender. The
// page segment reads the slug, so its full payload can't be reused for
// another slug; only its shell, which ends before the params, can.
export function generateStaticParams() {
  return [{ slug: 'foo' }, { slug: 'bar' }]
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <CachedContent />
      <div id="params-boundary">
        <Suspense fallback={<p>Loading params...</p>}>
          <ParamsContent params={params} />
        </Suspense>
      </div>
    </main>
  )
}

async function CachedContent() {
  'use cache'
  // Default cache life, since shells leave out entries under 5 minutes stale.
  return <p id="cached-content">Cached content</p>
}

async function ParamsContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // One string, so the tests can match it in the response.
  return <p>{`Param: ${slug}`}</p>
}
