import { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  'use cache: remote'

  // We're reading params here. This makes the cache function dynamic during
  // prerendering, and thus the title should be excluded from the partially
  // prerendered page.
  const { slug } = await params

  return { title: new Date().toISOString(), keywords: [slug] }
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Dynamic />
    </Suspense>
  )
}

async function Dynamic() {
  await connection()

  return <p>Dynamic</p>
}
