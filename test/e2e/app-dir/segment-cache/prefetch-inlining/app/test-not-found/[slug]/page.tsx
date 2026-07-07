import { notFound } from 'next/navigation'

// Some slugs trigger notFound() during prerendering. This produces a
// different RSC payload shape. collectPrefetchHints must handle this
// without crashing the build.
export default async function NotFoundPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (slug === 'missing') {
    notFound()
  }
  return <p id="page-not-found">Found: {slug}</p>
}

export function generateStaticParams() {
  return [{ slug: 'exists' }, { slug: 'missing' }]
}
