import { notFound } from 'next/navigation'

import { existingSlugs, isKnownSlug, normalizeSlug } from '../../lib/slugs'

export const instant = false

export function generateStaticParams() {
  return existingSlugs.map((slug) => ({
    slug: slug.split('/').filter(Boolean),
  }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug: segments } = await params
  const slug = normalizeSlug(segments)

  if (!isKnownSlug(slug)) {
    notFound()
  }

  return <h1>Hello, World!</h1>
}
