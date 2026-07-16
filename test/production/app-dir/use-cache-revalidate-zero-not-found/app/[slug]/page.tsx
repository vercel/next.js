import { cacheLife } from 'next/cache'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <Suspense fallback={null}>
      <CachedPage slug={slug} />
    </Suspense>
  )
}

async function CachedPage({ slug }: { slug: string }) {
  'use cache'

  cacheLife({ revalidate: 0 })

  if (slug !== 'known') {
    notFound()
  }

  return <p>known</p>
}
