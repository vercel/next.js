import { getData } from '../../../lib/data'

// Only this slug is prerendered. The tests request a different one, so its
// entries are written at runtime.
export function generateStaticParams() {
  return [{ slug: 'build' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  // Awaited outside any Suspense boundary, so each slug is rendered on demand
  // into its own response cache entry.
  const { slug } = await params
  return <p id="data">{await getData(`static/${slug}`)}</p>
}
