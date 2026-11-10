// Declaring the slugs makes them statically known, so the un-suspended `await`
// below doesn't trip the static-shell validation ("missing Suspense boundary").
// In dev this doesn't pre-fill the cache, so the first request per slug is still
// a genuine cold miss.
export function generateStaticParams() {
  return [{ slug: '1' }, { slug: '2' }, { slug: '3' }]
}

async function getSlowData(slug: string) {
  'use cache'
  // Keyed by `slug` so each value is a distinct cache entry that misses, and
  // fills slowly, the first time it's requested in a dev session.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  return `Hello slow render (${slug})!`
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Not wrapped in Suspense: the shell waits for the cache fill, keeping the
  // client transition pending long enough to observe the render indicator.
  const data = await getSlowData(slug)
  return <p id="slow-render">{data}</p>
}
