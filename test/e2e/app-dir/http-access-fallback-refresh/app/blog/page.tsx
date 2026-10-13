import { notFound } from 'next/navigation'
import { Suspense } from 'react'

async function BlogContent({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams

  if (category === 'invalid') {
    notFound()
  }

  return (
    <main id="blog-content">
      <p>All posts</p>
    </main>
  )
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  return (
    <Suspense fallback={<p id="loading">Loading...</p>}>
      <BlogContent searchParams={searchParams} />
    </Suspense>
  )
}
